document.addEventListener('DOMContentLoaded', () => {

  /* ---------- Header scroll state ---------- */
  const header = document.getElementById('header');
  const onScroll = () => {
    header.classList.toggle('scrolled', window.scrollY > 40);
  };
  onScroll();
  window.addEventListener('scroll', onScroll);

  /* ---------- Mobile nav toggle ---------- */
  const navToggle = document.getElementById('navToggle');
  const navLinks = document.getElementById('navLinks');

  navToggle.addEventListener('click', () => {
    const isOpen = navLinks.classList.toggle('open');
    navToggle.classList.toggle('open', isOpen);
    navToggle.setAttribute('aria-expanded', String(isOpen));
  });

  navLinks.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      navLinks.classList.remove('open');
      navToggle.classList.remove('open');
      navToggle.setAttribute('aria-expanded', 'false');
    });
  });

  /* ---------- Active nav link on scroll ---------- */
  const sections = document.querySelectorAll('main section[id], .hero[id]');
  const navAnchors = document.querySelectorAll('.nav-link');

  const sectionObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const id = entry.target.getAttribute('id');
        navAnchors.forEach(a => {
          a.classList.toggle('active', a.getAttribute('href') === `#${id}`);
        });
      }
    });
  }, { rootMargin: '-40% 0px -55% 0px' });

  sections.forEach(section => sectionObserver.observe(section));

  /* ---------- Reveal on scroll ---------- */
  const revealObserver = new IntersectionObserver((entries, obs) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        obs.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15 });

  document.querySelectorAll('.reveal').forEach(el => revealObserver.observe(el));

  /* ---------- Gallery filter ---------- */
  const filterButtons = document.querySelectorAll('.filter-btn');
  const galleryItems = document.querySelectorAll('.gallery-item');

  filterButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      filterButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const filter = btn.dataset.filter;
      galleryItems.forEach(item => {
        const match = filter === 'all' || item.dataset.category === filter;
        item.classList.toggle('hidden-item', !match);
      });
    });
  });

  /* ---------- Lightbox ---------- */
  const lightbox = document.getElementById('lightbox');
  const lightboxImg = document.getElementById('lightboxImg');
  const lightboxCaption = document.getElementById('lightboxCaption');
  const lightboxClose = document.getElementById('lightboxClose');
  const lightboxPrev = document.getElementById('lightboxPrev');
  const lightboxNext = document.getElementById('lightboxNext');

  const items = Array.from(galleryItems);
  let currentIndex = 0;

  function supportsWebp() {
    const canvas = document.createElement('canvas');
    return !!(canvas.getContext && canvas.toDataURL('image/webp').indexOf('data:image/webp') === 0);
  }
  const useWebp = supportsWebp();

  function updateLightbox() {
    const item = items[currentIndex];
    const label = item.querySelector('.gallery-overlay span')?.textContent;
    const caption = item.querySelector('.gallery-overlay p')?.textContent;

    lightboxImg.src = useWebp ? item.dataset.largeWebp : item.dataset.largeJpg;
    lightboxImg.alt = caption || '';
    lightboxCaption.textContent = [label, caption].filter(Boolean).join(' — ');
  }

  function openLightbox(index) {
    currentIndex = index;
    updateLightbox();
    lightbox.classList.add('open');
    lightbox.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function closeLightbox() {
    lightbox.classList.remove('open');
    lightbox.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  function showNext(delta) {
    currentIndex = (currentIndex + delta + items.length) % items.length;
    updateLightbox();
  }

  items.forEach((item, index) => {
    item.addEventListener('click', () => openLightbox(index));
  });

  lightboxClose.addEventListener('click', closeLightbox);
  lightboxPrev.addEventListener('click', () => showNext(-1));
  lightboxNext.addEventListener('click', () => showNext(1));

  lightbox.addEventListener('click', (e) => {
    if (e.target === lightbox) closeLightbox();
  });

  document.addEventListener('keydown', (e) => {
    if (!lightbox.classList.contains('open')) return;
    if (e.key === 'Escape') closeLightbox();
    if (e.key === 'ArrowLeft') showNext(-1);
    if (e.key === 'ArrowRight') showNext(1);
  });

  /* ---------- Contact form ---------- */
  // data-endpoint (Formular-Dienst, z. B. https://formspree.io/f/xxxx) steht im <form> in index.html.
  // Ohne Endpoint öffnet sich stattdessen das Mailprogramm mit vorausgefüllter Nachricht.
  const form = document.getElementById('contactForm');
  const formStatus = document.getElementById('formStatus');

  function setStatus(text, type) {
    formStatus.textContent = text;
    formStatus.className = `form-status ${type}`;
  }

  if (form) form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const name = form.name.value.trim();
    const email = form.email.value.trim();
    const message = form.message.value.trim();
    const subject = form.subject.options[form.subject.selectedIndex].text;
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!name || !email || !message || !emailPattern.test(email)) {
      setStatus('Bitte fülle alle Felder korrekt aus.', 'error');
      return;
    }

    const endpoint = form.dataset.endpoint;
    const contactEmail = form.dataset.email;

    if (!endpoint) {
      const body = `${message}\n\n— ${name} (${email})`;
      window.location.href = `mailto:${contactEmail}?subject=${encodeURIComponent(`Anfrage: ${subject}`)}&body=${encodeURIComponent(body)}`;
      setStatus('Dein E-Mail-Programm wird geöffnet. Sende die Nachricht dort ab.', 'success');
      return;
    }

    const submitButton = form.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    setStatus('Wird gesendet …', 'success');

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ name, email, anfrage: subject, message }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setStatus(`Danke, ${name}! Deine Nachricht ist angekommen — ich melde mich bei dir.`, 'success');
      form.reset();
    } catch (err) {
      console.warn('Formular konnte nicht gesendet werden:', err);
      setStatus(`Das Senden hat leider nicht geklappt. Schreib mir bitte direkt an ${contactEmail}.`, 'error');
    } finally {
      submitButton.disabled = false;
    }
  });

  /* ---------- Footer year ---------- */
  document.getElementById('year').textContent = new Date().getFullYear();

});
