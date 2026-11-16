// Pages juridiques : le choix d'une langue dans le sélecteur est mémorisé pour l'application.
document.querySelectorAll('[data-setlang]').forEach((a) => a.addEventListener('click', () => {
  try { localStorage.setItem('marches:lang', JSON.stringify(a.dataset.setlang)); } catch { /* stockage indisponible */ }
}));
