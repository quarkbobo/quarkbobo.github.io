(() => {
  const root = document.documentElement
  const toggle = document.querySelector('.nav-toggle')
  const menu = document.querySelector('.site-nav')

  root.classList.add('is-enhanced')

  if (!toggle || !menu) return

  toggle.addEventListener('click', () => {
    const isOpen = toggle.getAttribute('aria-expanded') === 'true'
    toggle.setAttribute('aria-expanded', String(!isOpen))
    menu.classList.toggle('is-open', !isOpen)
  })
})()
