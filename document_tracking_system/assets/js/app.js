document.addEventListener('click', function (event) {
  const element = event.target.closest('[data-confirm]');
  if (element && !window.confirm(element.getAttribute('data-confirm'))) {
    event.preventDefault();
  }
});
