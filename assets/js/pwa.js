// PWA registration kept deliberately small for the no-build offline-first app.
(function () {
    'use strict';

    window.ExamApp = window.ExamApp || {};

    function refreshRouteLinks() {
        window.ExamApp.router?.updateRouteLinks?.();
    }

    async function registerServiceWorker() {
        if (!('serviceWorker' in navigator)) return;
        if (window.location.protocol === 'file:') return;

        try {
            const registration = await navigator.serviceWorker.register('./service-worker.js');
            window.ExamApp.serviceWorkerRegistration = registration;
            await navigator.serviceWorker.ready;
            refreshRouteLinks();
        } catch (error) {
            window.ExamApp?.warn?.('Service worker registration failed', error);
        }
    }

    navigator.serviceWorker?.addEventListener?.('controllerchange', refreshRouteLinks);

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', registerServiceWorker, { once: true });
    } else {
        registerServiceWorker();
    }
})();
