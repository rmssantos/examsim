import importlib.util
import json
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
        self.assertNotIn('data-analytics-', markup)
        self.assertNotIn('999', markup)
        self.assertNotIn('STALE', markup)
        self.assertNotIn('Unlock', markup)
        schema = json.loads(PAGES.build_jsonld(meta))
        self.assertNotIn('999', json.dumps(schema))

if __name__ == '__main__':
    unittest.main()
