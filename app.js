document.addEventListener('click', event => {
  const button = event.target.closest('[data-dialog]');
  if (!button) return;
  const dialog = document.getElementById(button.dataset.dialog);
  if (dialog && !dialog.open) dialog.showModal();
});
document.querySelectorAll('dialog').forEach(dialog => {
  dialog.querySelectorAll('.close-dialog,.close-action').forEach(button => button.addEventListener('click', () => dialog.close()));
  dialog.addEventListener('click', event => { if (event.target === dialog) {
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  }});
});
