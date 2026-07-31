(function () {
  function preferredTheme() {
    const saved = localStorage.getItem('theme');
    if (saved === 'dark' || saved === 'light') return saved;
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function applyTheme(theme, persist = false) {
    const isDark = theme === 'dark';
    document.body.classList.toggle('dark-mode', isDark);
    if (persist) localStorage.setItem('theme', theme);

    const icon = document.getElementById('legalThemeIcon');
    const toggle = document.getElementById('legalThemeToggle');
    if (icon) icon.className = isDark ? 'fas fa-sun' : 'fas fa-moon';
    if (toggle) {
      toggle.title = isDark ? 'Switch to light mode' : 'Switch to dark mode';
      toggle.setAttribute('aria-label', toggle.title);
    }
  }

  function applyFileIndexFallbacks() {
    if (window.location.protocol !== 'file:') return;

    document.querySelectorAll('a[data-file-index]').forEach(link => {
      const href = link.getAttribute('href');
      if (!href || !href.endsWith('/')) return;
      link.setAttribute('href', `${href}index.html`);
    });
  }

  applyTheme(preferredTheme());

  document.addEventListener('DOMContentLoaded', () => {
    applyFileIndexFallbacks();

    const toggle = document.getElementById('legalThemeToggle');
    if (!toggle) return;

    toggle.addEventListener('click', () => {
      applyTheme(document.body.classList.contains('dark-mode') ? 'light' : 'dark', true);
    });
  });
})();
