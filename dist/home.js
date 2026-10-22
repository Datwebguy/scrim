const menu = document.querySelector('.menu');
const header = document.querySelector('.topbar');

menu?.addEventListener('click', () => {
  const open = header.classList.toggle('open');
  menu.setAttribute('aria-expanded', String(open));
});

document.querySelectorAll('.nav a').forEach((link) => link.addEventListener('click', () => {
  header.classList.remove('open');
  menu?.setAttribute('aria-expanded', 'false');
}));

const steps = [...document.querySelectorAll('.step')];
const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      steps.forEach((step) => step.classList.toggle('active', step === entry.target));
    }
  });
}, { threshold: 0.65 });
steps.forEach((step) => observer.observe(step));
