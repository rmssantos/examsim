// Browser-native routing helpers for clean app URLs without introducing a framework.
(function () {
    'use strict';

    const app = window.ExamApp = window.ExamApp || {};

    function isFileMode() {
        return window.location.protocol === 'file:';
    }

    function getBasePath() {
        const path = window.location.pathname || '/';
        const knownFiles = ['index.html', 'exam.html', 'editor.html', 'privacy-and-storage.html', '404.html'];
        const segments = path.split('/').filter(Boolean);

        if (segments.length > 0 && knownFiles.includes(segments[segments.length - 1])) {
            segments.pop();
        } else if (segments.length > 0 && ['editor', 'exam', 'study', 'privacy-and-storage'].includes(segments[segments.length - 1])) {
            segments.pop();
        }

        return `/${segments.join('/')}${segments.length ? '/' : ''}`;
    }

    function cleanRoutesSupported() {
        if (isFileMode()) return false;
        const host = window.location.hostname;
        if (host === 'localhost' || host === '127.0.0.1') return true;
        return Boolean(navigator.serviceWorker?.controller);
    }

    function withBase(route) {
        const base = getBasePath();
        const cleanRoute = String(route || '').replace(/^\/+/, '');
        return `${base}${cleanRoute}`;
    }

    function buildUrl(page, params = {}) {
        const query = new URLSearchParams();
        Object.entries(params).forEach(([key, value]) => {
            if (value !== undefined && value !== null && value !== '') {
                query.set(key, value);
            }
        });
        const queryString = query.toString();

        if (!cleanRoutesSupported()) {
            const fileMap = {
                home: 'index.html',
                editor: 'editor.html',
                exam: 'exam.html',
                study: 'exam.html',
                'privacy-and-storage': 'privacy-and-storage.html'
            };
            const fileName = fileMap[page] || 'index.html';
            return queryString ? `${fileName}?${queryString}` : fileName;
        }

        if (page === 'home') return withBase('');
        if (page === 'editor') return withBase('editor');
        if (page === 'privacy-and-storage') return withBase('privacy-and-storage');
        if (page === 'study') return `${withBase('study')}${queryString ? `?${queryString}` : ''}`;
        if (page === 'exam') return `${withBase('exam')}${queryString ? `?${queryString}` : ''}`;
        return withBase('');
    }

    function getRoute() {
        const base = getBasePath();
        let routePath = window.location.pathname || '/';
        if (routePath.startsWith(base)) {
            routePath = routePath.slice(base.length);
        }
        routePath = routePath.replace(/^\/+|\/+$/g, '');
        const firstSegment = routePath.split('/')[0] || 'home';
        return {
            page: firstSegment === 'home' || firstSegment === 'index.html' ? 'home' : firstSegment,
            isClean: ['editor', 'exam', 'study', 'privacy-and-storage'].includes(firstSegment)
        };
    }

    function updateRouteLinks(root = document) {
        root.querySelectorAll('[data-route]').forEach(link => {
            const route = link.getAttribute('data-route');
            if (!route) return;
            link.setAttribute('href', buildUrl(route));
        });
    }

    function init() {
        updateRouteLinks();
    }

    app.router = Object.freeze({
        buildUrl,
        cleanRoutesSupported,
        getBasePath,
        getRoute,
        init,
        isFileMode,
        updateRouteLinks
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }
})();
