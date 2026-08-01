(function () {
  'use strict';

  const state = {
    details: null,
    screenshotBase64: null,
    screenshotMimeType: null,
  };

  // ---------- Step navigation ----------

  function goToStep(stepNumber) {
    document.querySelectorAll('.step').forEach((el) => {
      el.hidden = el.dataset.step !== String(stepNumber);
    });
    document.querySelectorAll('.progress-step').forEach((el) => {
      const n = Number(el.dataset.step);
      el.classList.toggle('is-active', n === stepNumber);
      el.classList.toggle('is-done', n < stepNumber);
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ---------- Step 1: Details form ----------

  const detailsForm = document.getElementById('details-form');

  detailsForm.addEventListener('submit', function (e) {
    e.preventDefault();
    clearErrors();

    const name = detailsForm.name.value.trim();
    const age = detailsForm.age.value;
    const community = detailsForm.community.value.trim();
    const email = detailsForm.email.value.trim();
    const phone = detailsForm.phone.value.trim();
    const foodPreference = detailsForm.foodPreference.value;

    let hasError = false;

    if (!name) { showError('name', 'Please enter your name.'); hasError = true; }
    if (!age || age < 1 || age > 120) { showError('age', 'Please enter a valid age.'); hasError = true; }
    if (!community) { showError('community', 'Please enter your community.'); hasError = true; }
    if (!isValidEmail(email)) { showError('email', 'Please enter a valid email address.'); hasError = true; }
    if (!isValidPhone(phone)) { showError('phone', 'Please enter a valid phone number.'); hasError = true; }
    if (!foodPreference) { showError('foodPreference', 'Please select a food preference.'); hasError = true; }

    if (hasError) return;

    state.details = { name, age, community, email, phone, foodPreference };
    setupPaymentStep();
    goToStep(2);
  });

  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  function isValidPhone(phone) {
    const digits = phone.replace(/\D/g, '');
    return digits.length >= 10;
  }

  function showError(field, message) {
    const el = document.getElementById('err-' + field);
    if (el) el.textContent = message;
    const input = document.getElementById(field) || document.querySelector(`[name="${field}"]`);
    if (input) input.setAttribute('aria-invalid', 'true');
  }

  function clearErrors() {
    document.querySelectorAll('.field-error').forEach((el) => (el.textContent = ''));
    document.querySelectorAll('[aria-invalid]').forEach((el) => el.removeAttribute('aria-invalid'));
  }

  // ---------- Step 2: Payment ----------

  function setupPaymentStep() {
    const cfg = REGISTRATION_CONFIG;
    const upiParams = new URLSearchParams({
      pa: cfg.UPI_ID,
      pn: cfg.PAYEE_NAME,
      am: String(cfg.AMOUNT),
      cu: 'INR',
      tn: cfg.TRANSACTION_NOTE,
    });
    const upiUri = 'upi://pay?' + upiParams.toString();

    document.getElementById('upi-pay-button').href = upiUri;
    document.getElementById('upi-id-display').textContent = cfg.UPI_ID;

    // Render QR for laptop/desktop users. Always rendered — CSS decides
    // whether to show the button or the QR block based on screen size,
    // since JS-based device detection is unreliable.
    const qrContainer = document.getElementById('upi-qr-code');
    qrContainer.innerHTML = '';
    new QRCode(qrContainer, {
      text: upiUri,
      width: 200,
      height: 200,
      colorDark: '#1a2456',
      colorLight: '#ffffff',
    });
  }

  document.getElementById('back-to-step-1').addEventListener('click', function () {
    goToStep(1);
  });

  document.getElementById('back-to-step-1-top').addEventListener('click', function () {
    goToStep(1);
  });

  // ---------- Screenshot upload + compression ----------

  const screenshotInput = document.getElementById('screenshot');
  const uploadPreview = document.getElementById('upload-preview');
  const uploadPreviewImg = document.getElementById('upload-preview-img');
  const submitBtn = document.getElementById('submit-registration');

  screenshotInput.addEventListener('change', async function () {
    const file = screenshotInput.files[0];
    document.getElementById('err-screenshot').textContent = '';

    if (!file) {
      state.screenshotBase64 = null;
      submitBtn.disabled = true;
      return;
    }

    if (!file.type.startsWith('image/')) {
      document.getElementById('err-screenshot').textContent = 'Please upload an image file.';
      submitBtn.disabled = true;
      return;
    }

    try {
      const { base64, mimeType, dataUrl } = await compressImage(
        file,
        REGISTRATION_CONFIG.SCREENSHOT_MAX_WIDTH,
        REGISTRATION_CONFIG.SCREENSHOT_JPEG_QUALITY
      );
      state.screenshotBase64 = base64;
      state.screenshotMimeType = mimeType;

      uploadPreviewImg.src = dataUrl;
      uploadPreview.hidden = false;
      submitBtn.disabled = false;
    } catch (err) {
      document.getElementById('err-screenshot').textContent = 'Could not process that image. Please try another.';
      submitBtn.disabled = true;
    }
  });

  document.getElementById('upload-remove').addEventListener('click', function () {
    screenshotInput.value = '';
    state.screenshotBase64 = null;
    uploadPreview.hidden = true;
    submitBtn.disabled = true;
  });

  function compressImage(file, maxWidth, quality) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('File read failed'));
      reader.onload = (e) => {
        const img = new Image();
        img.onerror = () => reject(new Error('Image decode failed'));
        img.onload = () => {
          let { width, height } = img;
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);

          const dataUrl = canvas.toDataURL('image/jpeg', quality);
          const base64 = dataUrl.split(',')[1];
          resolve({ base64, mimeType: 'image/jpeg', dataUrl });
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  // ---------- Submit registration ----------

  submitBtn.addEventListener('click', async function () {
    if (!state.details || !state.screenshotBase64) return;

    const submitError = document.getElementById('err-submit');
    submitError.textContent = '';
    setSubmitLoading(true);

    const payload = {
      ...state.details,
      screenshotBase64: state.screenshotBase64,
      screenshotMimeType: state.screenshotMimeType,
    };

    try {
      const response = await fetch(REGISTRATION_CONFIG.API_URL, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Registration failed. Please try again.');
      }

      showConfirmation(result.groupNumber, result.registrationId);
    } catch (err) {
      submitError.textContent =
        'Something went wrong submitting your registration. Please check your connection and try again.';
      setSubmitLoading(false);
    }
  });

  function setSubmitLoading(isLoading) {
    submitBtn.disabled = isLoading;
    submitBtn.querySelector('.btn-text').hidden = isLoading;
    submitBtn.querySelector('.btn-spinner').hidden = !isLoading;
  }

  function showConfirmation(groupNumber, registrationId) {
    document.getElementById('confirm-name').textContent = state.details.name;
    document.getElementById('confirm-group').textContent = groupNumber;
    document.getElementById('confirm-email').textContent = state.details.email;
    document.getElementById('confirm-id').textContent = registrationId;
    goToStep(3);
  }
})();
