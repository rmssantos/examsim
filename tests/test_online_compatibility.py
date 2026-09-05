import importlib.util
import json
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
IDS = ('ai103', 'ab620', 'sc300', 'dp700', 'az400', 'az305', 'saac03', 'az104')
spec = importlib.util.spec_from_file_location('online_pages', ROOT / 'tools/generate-exam-pages.py')
PAGES = importlib.util.module_from_spec(spec)
spec.loader.exec_module(PAGES)


class OnlineCompatibilityTests(unittest.TestCase):
    def test_offers_and_recommendations_use_stable_online_destinations(self):
        for path in (ROOT / 'user-content/exams').glob('*/metadata.json'):
            meta = json.loads(path.read_text(encoding='utf-8'))
            for field in ('pro', 'recommendedPro'):
                offer = meta.get(field)
                if not offer:
                    continue
                target = meta['id'] if field == 'pro' else offer['examId']
                with self.subTest(exam=meta['id'], field=field):
                    self.assertIn(target, IDS)
                    self.assertEqual('online', offer.get('delivery'))
                    self.assertEqual(f'https://examplar.app/exams/{target}/', offer['url'])
                    self.assertNotIn('price', offer)
                    self.assertNotIn('promotion', offer)

    def test_landing_online_offer_never_advertises_local_activation_or_stale_price(self):
        meta = json.loads((ROOT / 'user-content/exams/az104/metadata.json').read_text())
        meta['pro'].update(delivery='online', price='999 EUR', promotion={
            'discountPercent': 30, 'code': 'STALE', 'label': 'Old offer'})
        markup = PAGES.build_pro(meta)
        self.assertIn('View complete exam online', markup)
        self.assertIn('account and internet connection', markup)
        self.assertIn('No offline download', markup)
        self.assertIn('online_exam_clicked', markup)
        self.assertNotIn('999', markup)
        self.assertNotIn('STALE', markup)
        self.assertNotIn('Unlock', markup)
        schema = json.loads(PAGES.build_jsonld(meta))
        self.assertNotIn('999', json.dumps(schema))

    def test_online_events_are_bounded_and_local_private_file_and_opt_out_are_silent(self):
        script = r'''
const fs = require('fs'), vm = require('vm');
const src = fs.readFileSync('assets/js/analytics.js','utf8').replace('__APPINSIGHTS_CONNECTION_STRING__', 'InstrumentationKey=test;IngestionEndpoint=https://example.test');
const all=[];
for(const [host, protocol, optOut] of [['examplar.app','https:',false],['localhost','http:',false],['preview.examplar.app','https:',false],['','file:',false],['examplar.app','https:',true]]) {
 const sent=[], handlers={};
 const ctx={ URL, setTimeout, HTMLElement:function(){}, localStorage:{getItem(){return optOut?'true':null},setItem(){},removeItem(){}}, sessionStorage:{getItem(){return null},setItem(){},removeItem(){}}, fetch(_u,o){const e=JSON.parse(o.body)[0];if(e.data.baseType==='EventData')sent.push(e.data.baseData);return Promise.resolve()}, document:{readyState:'loading', referrer:'',addEventListener(t,h){handlers[t]=h},getElementById(){return {}}}, window:{ExamApp:{isPublicSiteHost(h){return ['examplar.app','www.examplar.app','rmssantos.github.io'].includes(h)}},location:{hostname:host,protocol,pathname:'/',href:`${protocol}//${host}/?gclid=Click_ID-123_ABC&email=secret@example.com`}} };
 vm.runInNewContext(src,ctx);
 const api=ctx.window.ExamApp.analytics;
 if (typeof api.trackOnlineExamClicked !== 'function') {all.push({missing:true});continue;}
 handlers.DOMContentLoaded();
 const href='https://examplar.app/exams/ai103/';
 const cta={href,dataset:{analyticsEvent:'online_exam_clicked',analyticsExam:'ai103',analyticsPlacement:'homepage_modal',analyticsSourceExam:'ai901',email:'secret@example.com',key:'private'}};
 handlers.click({target:{closest(){return cta}},preventDefault(){throw new Error('Online navigation must remain native')}});
 if(cta.href!==href)throw new Error('Online links must not carry identifiers');
 api.trackOnlineExamClicked('secret@example.com',{placement:'https://secret.example'});
 ctx.window.userExams={'private-label-outside-catalogue':{source:'bundled',trust:'bundled'},az104:{source:'imported',trust:'local-unverified'}};
 api.trackOnlineExamClicked('private-label-outside-catalogue');
 api.trackOnlineExamClicked('ai103',{sourceExam:'private-label-outside-catalogue'});
 api.trackOnlineExamClicked('az104');
 all.push(sent);
}
console.log(JSON.stringify(all));
'''
        result = subprocess.run(['node', '-e', script], cwd=ROOT, check=True,
                                capture_output=True, text=True)
        events = json.loads(result.stdout)
        self.assertIsInstance(events[0], list, 'online event API is missing')
        self.assertEqual(2, len(events[0]))
        event = events[0][0]
        self.assertEqual('online_exam_clicked', event['name'])
        self.assertEqual('homepage_modal', event['properties']['placement'])
        self.assertEqual('ai901', event['properties']['source_exam_id'])
        self.assertNotIn('secret', json.dumps(event))
        self.assertNotIn('private', json.dumps(event))
        self.assertNotIn('source_exam_id', events[0][1]['properties'])
        self.assertNotIn('private-label-outside-catalogue', json.dumps(events))
        self.assertEqual([[], [], [], []], events[1:])


if __name__ == '__main__':
    unittest.main()
