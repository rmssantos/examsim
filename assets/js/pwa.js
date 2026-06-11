// PWA registration kept deliberately small for the no-build offline-first app.
(function () {
    'use strict';

    window.ExamApp = window.ExamApp || {};
    let updateReloadPending = false;

    function refreshRouteLinks() {
        window.ExamApp.router?.updateRouteLinks?.();
    }

    function ensureUpdateToastStyles() {
        if (document.getElementById('examsim-update-toast-styles')) return;
        const style = document.createElement('style');
        style.id = 'examsim-update-toast-styles';
        style.textContent = `
            .examsim-update-toast {
                position: fixed;
                right: 18px;
                bottom: 18px;
                z-index: 12000;
                display: grid;
                grid-template-columns: 1fr auto;
                gap: 14px;
                align-items: center;
                width: min(420px, calc(100vw - 32px));
                padding: 14px;
                color: #e8ebf0;
                background: #1d232f;
                border: 1px solid rgba(45, 212, 191, 0.35);
                border-radius: 8px;
                box-shadow: 0 18px 44px rgba(15, 23, 42, 0.35);
            }
            .examsim-update-toast strong {
                display: block;
                margin-bottom: 2px;
                font-size: 14px;
            }
            .examsim-update-toast span {
                display: block;
                color: #cbd5e1;
                font-size: 13px;
                line-height: 1.35;
            }
            .examsim-update-toast-actions {
                display: flex;
                gap: 8px;
                align-items: center;
            }
            .examsim-update-toast button {
                min-height: 34px;
                padding: 7px 10px;
                color: #e2e8f0;
                background: rgba(148, 163, 184, 0.16);
                border: 1px solid rgba(203, 213, 225, 0.24);
                border-radius: 7px;
                font: inherit;
                font-size: 13px;
                font-weight: 700;
                cursor: pointer;
            }
            .examsim-update-toast button.primary {
                color: #042f2e;
                background: #5eead4;
                border-color: #5eead4;
            }
            @media (max-width: 560px) {
                .examsim-update-toast {
                    grid-template-columns: 1fr;
                }
                .examsim-update-toast-actions {
                    justify-content: flex-end;
                }
            }
        `;
        document.head.appendChild(style);
    }

    function showUpdateAvailable(registration) {
        if (!registration?.waiting || document.getElementById('examsim-update-toast')) return;
        ensureUpdateToastStyles();

        const toast = document.createElement('div');
        toast.id = 'examsim-update-toast';
        toast.className = 'examsim-update-toast';
        toast.setAttribute('role', 'status');
        toast.setAttribute('aria-live', 'polite');

        const copy = document.createElement('div');
        const title = document.createElement('strong');
        title.textContent = 'Update available';
        const text = document.createElement('span');
        text.textContent = 'Refresh to load the latest Examplar files and exam metadata.';
        copy.append(title, text);

        const actions = document.createElement('div');
        actions.className = 'examsim-update-toast-actions';

        const later = document.createElement('button');
        later.type = 'button';
        later.textContent = 'Later';
        later.addEventListener('click', () => toast.remove());

        const refresh = document.createElement('button');
        refresh.type = 'button';
        refresh.className = 'primary';
        refresh.textContent = 'Refresh';
        refresh.addEventListener('click', () => {
            updateReloadPending = true;
            registration.waiting?.postMessage({ type: 'SKIP_WAITING' });
        });

        actions.append(later, refresh);
        toast.append(copy, actions);
        document.body.appendChild(toast);
    }

    function watchForUpdates(registration) {
        if (registration.waiting && navigator.serviceWorker.controller) {
            showUpdateAvailable(registration);
        }

        registration.addEventListener('updatefound', () => {
            const worker = registration.installing;
            if (!worker) return;
            worker.addEventListener('statechange', () => {
                if (worker.state === 'installed' && navigator.serviceWorker.controller) {
                    showUpdateAvailable(registration);
                }
            });
        });
    }

    async function registerServiceWorker() {
        if (!('serviceWorker' in navigator)) return;
        if (window.location.protocol === 'file:') return;

        try {
            const registration = await navigator.serviceWorker.register('./service-worker.js');
            window.ExamApp.serviceWorkerRegistration = registration;
            watchForUpdates(registration);
            await navigator.serviceWorker.ready;
            refreshRouteLinks();
        } catch (error) {
            window.ExamApp?.warn?.('Service worker registration failed', error);
        }
    }

    navigator.serviceWorker?.addEventListener?.('controllerchange', () => {
        refreshRouteLinks();
        if (updateReloadPending) {
            window.location.reload();
        }
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', registerServiceWorker, { once: true });
    } else {
        registerServiceWorker();
    }
})();
