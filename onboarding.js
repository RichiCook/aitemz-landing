  // ---------- read email from query string ----------
  const params = new URLSearchParams(window.location.search);
  let email = (params.get('email') || '').trim();
  if (!email || !email.includes('@')) {
    // fallback for direct visits — show placeholder; do not break
    email = 'your@brand.com';
  }
  document.getElementById('emailDisplay').textContent = email;

  // ---------- progress ----------
  const form = document.getElementById('onboard');
  const requiredFields = [
    () => document.getElementById('firstName').value.trim(),
    () => document.getElementById('lastName').value.trim(),
    () => document.getElementById('role').value,
    () => document.getElementById('brand').value.trim(),
    () => document.getElementById('hq').value,
    () => document.getElementById('size').value,
    () => [...document.querySelectorAll('input[name=categories]:checked')].length > 0 ? '1' : '',
    () => document.querySelector('input[name=goal]:checked')?.value || '',
    () => document.getElementById('consent').checked ? '1' : '',
  ];
  const progressBar = document.getElementById('progressBar');
  const progressLabel = document.getElementById('progressLabel');
  const savedAt = document.getElementById('savedAt');

  function updateProgress(){
    const done = requiredFields.filter(fn => !!fn()).length;
    const pct = Math.round((done / requiredFields.length) * 100);
    progressBar.style.setProperty('--pct', pct + '%');
    progressLabel.textContent = pct + '%';
    const now = new Date();
    savedAt.textContent = now.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
  }
  form.addEventListener('input', updateProgress);
  form.addEventListener('change', updateProgress);
  updateProgress();

  // ---------- sliders (independent SKUs + units) ----------
  function fmtFull(n){
    return n.toLocaleString('en-US');
  }
  // Use a logarithmic SLIDER POSITION (0..1000) backed by an exponential value.
  // The native range input is linear, so we make IT the linear thing the user
  // drags and derive the displayed value from its position. This guarantees
  // the visual handle always sits exactly where the cursor is.
  function bindSlider(inputId, valId, fillId, handleId, minVal, maxVal, snap){
    const input = document.getElementById(inputId);
    const val   = document.getElementById(valId);
    const fill  = document.getElementById(fillId);
    const handle= document.getElementById(handleId);
    // input goes from 0..1000 linear; mapped to [minVal..maxVal] exponentially
    const lnMin = Math.log(minVal), lnMax = Math.log(maxVal);
    function posToValue(pos){
      const t = pos / 1000;
      const v = Math.exp(lnMin + t * (lnMax - lnMin));
      return Math.max(minVal, Math.min(maxVal, Math.round(v / snap) * snap));
    }
    function update(){
      const pos = parseInt(input.value, 10);
      const v = posToValue(pos);
      val.textContent = fmtFull(v);
      input.dataset.value = v;
      const pct = pos / 10; // 0..100
      fill.style.width = pct + '%';
      handle.style.left = pct + '%';
    }
    input.addEventListener('input', update);
    update();
    return () => parseInt(input.dataset.value || '0', 10);
  }
  // skus: 10 → 50k, snap to 10
  const getSkus  = bindSlider('skuInput', 'skuVal', 'skuFill', 'skuHandle', 10,  50000,  10);
  // units: 100 → 1M, snap to 100
  const getUnits = bindSlider('volInput', 'volVal', 'volFill', 'volHandle', 100, 1000000, 100);

  // ---------- founded year basic guard ----------
  document.getElementById('founded').addEventListener('input', e => {
    e.target.value = e.target.value.replace(/\D/g,'').slice(0,4);
  });

  // ---------- validation ----------
  function validate(){
    let ok = true;
    // basic required
    document.querySelectorAll('.field[data-required]').forEach(f => {
      const input = f.querySelector('input, select, textarea');
      if (!input) {
        // chips group
        const checked = f.querySelectorAll('input:checked').length;
        f.classList.toggle('invalid', checked === 0);
        if (checked === 0) ok = false;
        return;
      }
      const empty = !input.value.trim();
      f.classList.toggle('invalid', empty);
      if (empty) ok = false;
    });
    // goal radio
    const goalChosen = !!document.querySelector('input[name=goal]:checked');
    document.getElementById('goalErr').style.height = goalChosen ? '0' : '14px';
    if (!goalChosen) ok = false;
    // consent
    const consent = document.getElementById('consent');
    const consentLabel = consent.closest('.consent');
    consentLabel.classList.toggle('invalid', !consent.checked);
    if (!consent.checked) ok = false;
    return ok;
  }

  form.addEventListener('submit', e => {
    e.preventDefault();
    if (!validate()) {
      // scroll to first invalid
      const first = document.querySelector('.field.invalid, .consent.invalid');
      if (first) first.scrollIntoView({block:'center', behavior:'smooth'});
      return;
    }

    // build payload
    const payload = {
      email,
      firstName: document.getElementById('firstName').value.trim(),
      lastName:  document.getElementById('lastName').value.trim(),
      role:      document.getElementById('role').value,
      phone:     document.getElementById('phone').value.trim(),
      brand:     document.getElementById('brand').value.trim(),
      website:   document.getElementById('website').value.trim(),
      hq:        document.getElementById('hq').value,
      size:      document.getElementById('size').value,
      founded:   document.getElementById('founded').value.trim(),
      categories:[...document.querySelectorAll('input[name=categories]:checked')].map(i=>i.value),
      skus:      document.getElementById('skus').value,
      revenue:   document.getElementById('revenue').value,
      volume:    getUnits(),
      activeSkusCount: getSkus(),
      channels:  [...document.querySelectorAll('input[name=channels]:checked')].map(i=>i.value),
      goal:      document.querySelector('input[name=goal]:checked')?.value || '',
      timeline:  document.getElementById('timeline').value,
      budget:    document.getElementById('budget').value,
      referral:  document.getElementById('referral').value,
      notes:     document.getElementById('notes').value.trim(),
      newsletter:document.getElementById('newsletter').checked,
      ts:        Date.now(),
    };

    // notify admin parent if embedded
    try { window.parent.postMessage({type:'aitemz:onboarding', ...payload}, '*'); } catch(e){}

    document.getElementById('successName').textContent = payload.firstName || '';
    document.getElementById('successEmail').textContent = email;
    document.getElementById('formWrap').classList.add('hidden');
    document.getElementById('success').classList.add('visible');
    window.scrollTo({top:0, behavior:'smooth'});
  });

  // clear invalid state on edit
  form.addEventListener('input', e => {
    const f = e.target.closest('.field');
    if (f) f.classList.remove('invalid');
    if (e.target.name === 'categories') {
      const fld = e.target.closest('.field');
      if (fld) fld.classList.remove('invalid');
    }
  });
  document.querySelectorAll('input[name=goal]').forEach(r=>{
    r.addEventListener('change', () => {
      document.getElementById('goalErr').style.height = '0';
    });
  });
  document.getElementById('consent').addEventListener('change', e => {
    e.target.closest('.consent').classList.remove('invalid');
  });
