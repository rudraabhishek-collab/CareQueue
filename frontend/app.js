/* ============================================================
           CareQueue frontend application
           ------------------------------------------------------------
           This file contains UI logic ONLY.

           Business logic (triage scoring, emergency status, token
           numbers, queue position, wait time, priority) is computed by
           the CareQueue backend API and is NOT duplicated here.

           The service functions below talk to the real backend.
           When an endpoint is not implemented yet, the API returns a
           clear error which the UI displays to the user.
           ============================================================ */

/* exported registerPatient, login, assessSymptoms, createToken,
           getTokenStatus, getHospitals, getQueue, toggleLangMenu,
           setLanguage, switchTab, toggleSym, setStep, processSymptoms,
           generateReceipt, refreshTokenStatus, sendOtp, verifyOtp,
           confirmHospital, moveFocus, resetAbha */

// ---- API service layer --------------------------------------
const API_BASE = '/api/v1';

async function apiRequest(path, options) {
  const { method = 'GET', body, token } = options || {};
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(API_BASE + path, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    throw new Error('Could not reach the CareQueue server. Is it running?');
  }

  let data = {};
  try {
    data = await res.json();
  } catch (_err) {
    /* non-JSON response */
  }

  if (!res.ok) {
    const error = new Error(data.error?.message || `Request failed (${res.status})`);
    error.status = res.status;
    error.code = data.error?.code || 'REQUEST_FAILED';
    throw error;
  }

  return data;
}

function registerPatient(patient) {
  return apiRequest('/patients', { method: 'POST', body: patient });
}

function login(credentials) {
  return apiRequest('/auth/login', { method: 'POST', body: credentials });
}

function assessSymptoms(payload) {
  return apiRequest('/triage/assess', { method: 'POST', body: payload });
}

function createToken(payload) {
  return apiRequest('/queue/tokens', { method: 'POST', body: payload });
}

function getTokenStatus(tokenNo) {
  return apiRequest('/tokens/' + encodeURIComponent(tokenNo));
}

function getHospitals() {
  return apiRequest('/hospitals');
}

function getQueue(hospitalId, departmentId) {
  return apiRequest(
    '/queue/' + encodeURIComponent(hospitalId) + '/' + encodeURIComponent(departmentId)
  );
}

// ---- UI helpers ----------------------------------------------
function escapeHtml(value) {
  return String(value ?? '').replace(
    /[&<>"']/g,
    (ch) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[ch]
  );
}

function showLoading(container, message) {
  container.innerHTML =
    '<div style="text-align:center; padding:30px; color:var(--text-muted);">' +
    '<i class="fa-solid fa-circle-notch fa-spin" style="font-size:2rem; color:var(--primary); display:block; margin-bottom:15px;"></i>' +
    '<span>' +
    escapeHtml(message || 'Processing...') +
    '</span>' +
    '</div>';
}

function showError(container, message, details) {
  container.innerHTML =
    '<div style="background:rgba(239,68,68,0.1); border:1px solid var(--danger); padding:24px; border-radius:16px; text-align:center;">' +
    '<i class="fa-solid fa-circle-exclamation" style="font-size:2rem; color:var(--danger); display:block; margin-bottom:12px;"></i>' +
    '<h3 style="color:var(--danger); margin-bottom:8px;">Something went wrong</h3>' +
    '<p style="color:var(--text-muted); margin-bottom:6px;">' +
    escapeHtml(message || 'Please try again.') +
    '</p>' +
    (details
      ? '<p style="color:var(--text-muted); font-size:0.85rem;">' + escapeHtml(details) + '</p>'
      : '') +
    '</div>';
}

function showStepError(stepId, message, details) {
  const step = document.getElementById(stepId);
  if (!step) return;
  const existing = document.getElementById('runtime-error');
  if (existing) existing.remove();
  const div = document.createElement('div');
  div.id = 'runtime-error';
  div.style.background = 'rgba(239,68,68,0.1)';
  div.style.border = '1px solid var(--danger)';
  div.style.padding = '16px 20px';
  div.style.borderRadius = '12px';
  div.style.marginBottom = '20px';
  div.style.color = 'var(--danger)';
  div.style.fontWeight = '600';
  div.innerHTML =
    '<i class="fa-solid fa-circle-exclamation" style="margin-right:8px;"></i>' +
    escapeHtml(message || 'Something went wrong.') +
    (details
      ? '<div style="font-weight:400; margin-top:4px; font-size:0.85rem; color:var(--text-muted);">' +
        escapeHtml(details) +
        '</div>'
      : '');
  step.insertBefore(div, step.firstChild);
}

function friendlyError(err) {
  if (err && err.code === 'NOT_FOUND') {
    return 'This feature is not connected yet. The CareQueue backend API is under active development.';
  }
  return err && err.message ? err.message : 'Something went wrong. Please try again.';
}

let symptoms = [];

// Add loader removal and enhanced animations
window.addEventListener('load', function () {
  setTimeout(function () {
    const loader = document.getElementById('loader');
    loader.style.opacity = '0';
    loader.style.transition = 'opacity 0.5s ease';

    setTimeout(function () {
      loader.style.display = 'none';

      // Add entrance animations to hero elements
      const heroTitle = document.querySelector('.hero-text h1');
      const heroSub = document.querySelector('.hero-sub');
      const heroButtons = document.querySelector('.btn-group');

      if (heroTitle) {
        heroTitle.style.animation = 'textReveal 1.5s cubic-bezier(0.77, 0, 0.175, 1) forwards';
        heroTitle.style.animationDelay = '0.2s';
      }

      if (heroSub) {
        heroSub.style.animation = 'fadeIn 1s ease forwards';
        heroSub.style.animationDelay = '0.6s';
        heroSub.style.opacity = '0';
      }

      if (heroButtons) {
        heroButtons.style.animation = 'fadeIn 1s ease forwards';
        heroButtons.style.animationDelay = '1s';
        heroButtons.style.opacity = '0';
      }

      // Add parallax effect on scroll
      window.addEventListener('scroll', function () {
        const scrolled = window.pageYOffset;
        const meshBg = document.querySelector('.mesh-bg');
        const gridOverlay = document.querySelector('.grid-overlay');

        if (meshBg) {
          meshBg.style.transform = `perspective(1000px) rotateX(${scrolled * 0.01}deg) rotateY(${scrolled * 0.005}deg) translateY(${scrolled * 0.05}px)`;
        }

        if (gridOverlay) {
          gridOverlay.style.backgroundPosition = `${scrolled * 0.1}px ${scrolled * 0.1}px`;
        }
      });

      // Enhanced hover effects for hospital cards
      const hospitalCards = document.querySelectorAll('.hosp-card, .facility-card');
      hospitalCards.forEach((card) => {
        card.addEventListener('mousemove', function (e) {
          const rect = this.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const y = e.clientY - rect.top;

          this.style.setProperty('--mouse-x', `${x}px`);
          this.style.setProperty('--mouse-y', `${y}px`);
        });
      });
    }, 500);
  }, 2500); // Show loader for 2.5 seconds
});

const translations = {
  en: {
    nav_home: 'Home',
    nav_opd: 'Book OPD',
    nav_status: 'Live Status',
    nav_abha: 'Link ABHA ID',
    nav_track: 'Track Token',
    system_live: 'System Live: Delhi NCR',
    hero_title: 'Skip the Queue.<br>Get Care <span class="highlight">Faster.</span>',
    hero_desc:
      'We connect the healthcare grid to balance patient load. Get AI-driven advice and instant OPD tokens.',
    btn_smart_booking: 'Smart Booking',
    btn_live_grid: 'Live Grid',
    stat_save_pre: 'It will save',
    stat_save_post: 'of time.',
    dash_occupancy: 'Live Occupancy',
    dash_realtime: 'Real-time',
    status_critical_98: 'Critical (98%)',
    status_heavy_89: 'Heavy (89%)',
    status_high_75: 'High (75%)',
    status_mod_65: 'Moderate (65%)',
    status_ideal_15: 'Ideal (15%)',

    // Registration Wizard
    reg_title: 'Smart OPD Booking',
    reg_subtitle: 'AI-powered triage and instant token generation.',
    step_symptoms: 'Symptoms',
    step_advice: 'Advice',
    step_details: 'Details',
    step_token: 'Token',
    q_symptoms: 'What are your symptoms?',
    sym_fever: 'High Fever',
    sym_cough: 'Cough/Cold',
    sym_chest: 'Chest Pain',
    sym_injury: 'Injury',
    sym_back: 'Back Pain',
    sym_dental: 'Toothache',
    sym_throat: 'Sore Throat',
    sym_ear: 'Ear Pain',
    sym_diarrhea: 'Loose Motion',
    sym_fatigue: 'Weakness',
    sym_vomit: 'Vomiting',
    sym_burn: 'Burn',
    sym_bite: 'Animal Bite',
    sym_acidity: 'Acidity/Gas',
    sym_urine: 'Urinary Issue',
    sym_stress: 'Anxiety/Stress',
    lbl_manual_sym: 'Other Symptoms / Description',
    btn_analyze: 'Analyze & Proceed',

    // Advice
    advice_tertiary_title: 'Tertiary Care Required',
    advice_tertiary_msg:
      'Based on your symptoms, we recommend visiting a major hospital for specialized care.',
    advice_phc_title: 'PHC Recommended',
    advice_phc_msg: 'Your condition is mild. Visit a Primary Health Center to save ~2 hours.',
    btn_book_here: 'Book Appointment',
    btn_back_sym: 'Back to Symptoms',
    status_heavy_load: 'Heavy Load',
    status_fast_track: 'Fast Track',

    // Form
    patient_details: 'Patient Details',
    booking_for: 'Booking for:',
    lbl_name: 'Patient Name',
    lbl_age: 'Age',
    lbl_hospital: 'Hospital',
    lbl_dept: 'Department',
    dept_gen: 'General Medicine',
    dept_ortho: 'Orthopedics',
    dept_ped: 'Pediatrics',
    btn_gen_token: 'Generate Token',
    btn_back: 'Back',
    placeholder_name: 'Enter Full Name',
    placeholder_age: 'Age',
    placeholder_desc: 'Type here...',

    // Receipt
    reg_success: 'Registration Successful',
    reg_save: 'Please save this token.',
    t_opd_token: 'OPD TOKEN',
    t_token_no: 'Token No',
    t_patient: 'Patient',
    t_hospital: 'Hospital',
    t_dept: 'Dept',
    t_valid: 'Valid for',
    btn_print: 'Print',
    btn_track_status: 'Track Status',

    // Tracking
    track_title: 'Track Token',
    track_subtitle: 'Check your position in the OPD queue.',
    track_label_token: 'YOUR TOKEN',
    track_label_serving: 'CURRENTLY SERVING',
    track_label_est: 'EST. WAIT TIME',
    track_people_ahead: 'People ahead of you',
    btn_home: 'Return Home',

    // Status
    live_grid_title: 'Live Network Grid',
    live_grid_sub: 'Real-time bed availability and OPD wait times.',
    tag_tertiary: 'TERTIARY',
    tag_phc_center: 'Primary Health Center',
    tag_tertiary_care: 'Tertiary Care, Multi-Specialty',
    h_civil: 'Civil Hospital',
    h_kamla: 'Kamla Nehru Hospital',
    h_aundh: 'Aundh District Hospital',
    h_rajiv: 'Rajiv Gandhi Hospital',
    h_shastri: 'Shastri Nagar PHC',
    h_aiims: 'AIIMS New Delhi',
    h_safdar: 'Safdarjung Hospital',
    h_rml: 'RML Hospital',
    h_lnjp: 'Lok Nayak Hospital',
    dash_wait_label: 'Wait Time',
    status_high_92: 'High (92 min)',
    status_low_15: 'Low (15 min)',
    time_10m: '10 min ago',
    time_45m: '45 min ago',
    tip_saved: 'Avg. time saved:',
    unit_mins: 'minutes',
    unit_min: 'min',

    // ABHA
    abha_title: 'Link ABHA',

    // Bottom Sections
    hs_title: 'Hospital Network Status',
    hs_subtitle:
      'Real-time status of government hospitals in your area. Find the facility with the shortest wait time.',
    hs_notif: 'Hospital Notifications',
    notif_1_title: 'High wait time at AIIMS',
    notif_1_body: 'Consider visiting a nearby PHC for non-emergency care',
    notif_2_title: 'Additional doctors at Safdarjung PHC',
    notif_2_body: '2 more GPs available until 6 PM',
    hs_tip_title: 'Health Tip of the Day',
    hs_tip_body:
      'For common colds and mild fevers, visiting a Primary Health Center is faster and more efficient than going to a large hospital. PHCs can handle 80% of common ailments.',
    res_title: 'Emergency & Health Resources',
    res_subtitle: 'Quick access to emergency services and important health information.',
    res_emerg_title: 'Emergency Services',
    res_emerg_desc:
      'For life-threatening conditions, proceed directly to emergency or call immediately.',
    btn_call_amb: 'Call 108 (Ambulance)',
    btn_near_er: 'Nearest Emergency Room',
    btn_directions: 'Get Directions',
    res_avail_doc: 'Available Doctors',
    res_distance: 'Distance',

    appt_1_title: 'Dr. A. Sharma - General Medicine',
    appt_today: 'Today, 2:30 PM',
    appt_1_loc: 'AIIMS Delhi, Room 205',
    btn_view_queue: 'View Queue',
    appt_2_title: 'Blood Test - Follow Up',
    appt_tmrw: 'Tomorrow, 10:00 AM',
    appt_2_loc: 'Safdarjung PHC, Lab Room 3',
    btn_reschedule: 'Reschedule',

    tl_1_date: 'January 2028',
    tl_1_title: 'Will Integrat with ABDM',
    tl_1_desc: 'Compatible with Ayushman Bharat Digital Mission ecosystem',
    tl_2_date: 'april 2027',
    tl_2_title: 'Try Expand to 5 States',
    tl_2_desc: 'Try to launch in Maharashtra, Gujarat, Rajasthan, Uttar Pradesh, and Delhi',
    tl_3_date: 'August 2026',
    tl_3_title: 'try to improve AI Triage Accuracy to 94%',
    tl_3_desc: 'Enhance symptom analysis algorithm with machine learning',
    foot_desc:
      'An intelligent triage and wait-time prediction system for Indian government hospitals, reducing wait times by 40% and improving healthcare access for all.',
    foot_copy: '© 2025 MedQueue.',
    foot_links: 'Quick Links',
    foot_contact: 'Contact Us',
    foot_addr: 'Ministry of Health, New Delhi',
  },
  hi: {
    nav_home: 'होम',
    nav_opd: 'ओपीडी बुकिंग',
    nav_status: 'लाइव स्टेटस',
    nav_abha: 'ABHA लिंक करें',
    nav_track: 'टोकन ट्रैक करें',
    system_live: 'सिस्टम लाइव: दिल्ली एनसीआर',
    hero_title: 'कतार छोड़ें।<br>इलाज पाएं <span class="highlight">तेजी से।</span>',
    hero_desc:
      'हम रोगी भार को संतुलित करने के लिए हेल्थकेयर ग्रिड को जोड़ते हैं। एआई-आधारित सलाह और तत्काल ओपीडी टोकन प्राप्त करें।',
    btn_smart_booking: 'स्मार्ट बुकिंग',
    btn_live_grid: 'लाइव ग्रिड',
    stat_save_pre: 'यह बचाएगा',
    stat_save_post: 'समय।',
    dash_occupancy: 'लाइव अधिभोग',
    dash_realtime: 'वास्तविक समय',
    status_critical_98: 'गंभीर (98%)',
    status_heavy_89: 'भारी (89%)',
    status_high_75: 'उच्च (75%)',
    status_mod_65: 'मध्यम (65%)',
    status_ideal_15: 'आदर्श (15%)',

    reg_title: 'स्मार्ट ओपीडी बुकिंग',
    reg_subtitle: 'एआई-संचालित ट्राइएज और तत्काल टोकन जनरेशन।',
    step_symptoms: 'लक्षण',
    step_advice: 'सलाह',
    step_details: 'विवरण',
    step_token: 'टोकन',
    q_symptoms: 'आपके लक्षण क्या हैं?',
    sym_fever: 'तेज़ बुखार',
    sym_cough: 'खांसी/जुकाम',
    sym_chest: 'छाती में दर्द',
    sym_injury: 'चोट',
    sym_back: 'पीठ दर्द',
    sym_dental: 'दांत दर्द',
    sym_throat: 'गले में खराश',
    sym_ear: 'कान दर्द',
    sym_diarrhea: 'दस्त',
    sym_fatigue: 'कमजोरी',
    sym_vomit: 'उल्टी',
    sym_burn: 'जलना',
    sym_bite: 'जानवर का काटना',
    sym_acidity: 'एसिडिटी/गैस',
    sym_urine: 'पेशाब की समस्या',
    sym_stress: 'तनाव/घबराहट',
    lbl_manual_sym: 'अन्य लक्षण / विवरण',
    btn_analyze: 'विश्लेषण करें',

    advice_tertiary_title: 'विशेष देखभाल की आवश्यकता',
    advice_tertiary_msg:
      'आपके लक्षणों के आधार पर, हम विशेष देखभाल के लिए बड़े अस्पताल जाने की सलाह देते हैं।',
    advice_phc_title: 'प्राथमिक केंद्र (PHC) अनुशंसित',
    advice_phc_msg: 'आपकी स्थिति सामान्य है। ~2 घंटे बचाने के लिए PHC पर जाएं।',
    btn_book_here: 'अपॉइंटमेंट बुक करें',
    btn_back_sym: 'लक्षणों पर वापस जाएं',
    status_heavy_load: 'भारी भीड़',
    status_fast_track: 'फास्ट ट्रैक',

    patient_details: 'रोगी का विवरण',
    booking_for: 'बुकिंग इसके लिए:',
    lbl_name: 'रोगी का नाम',
    lbl_age: 'आयु',
    lbl_hospital: 'अस्पताल',
    lbl_dept: 'विभाग',
    dept_gen: 'सामान्य चिकित्सा',
    dept_ortho: 'हड्डी रोग',
    dept_ped: 'बाल रोग',
    btn_gen_token: 'टोकन जनरेट करें',
    btn_back: 'वापस',
    placeholder_name: 'पूरा नाम दर्ज करें',
    placeholder_age: 'आयु',
    placeholder_desc: 'यहाँ टाइप करें...',

    reg_success: 'पंजीकरण सफल',
    reg_save: 'कृपया इस टोकन को सुरक्षित रखें।',
    t_opd_token: 'ओपीडी टोकन',
    t_token_no: 'टोकन नंबर',
    t_patient: 'रोगी',
    t_hospital: 'अस्पताल',
    t_dept: 'विभाग',
    t_valid: 'के लिए मान्य',
    btn_print: 'प्रिंट',
    btn_track_status: 'स्थिति ट्रैक करें',

    track_title: 'टोकन ट्रैक करें',
    track_subtitle: 'ओपीडी कतार में अपनी स्थिति जांचें।',
    track_label_token: 'आपका टोकन',
    track_label_serving: 'वर्तमान में सेवा',
    track_label_est: 'अनुमानित समय',
    track_people_ahead: 'आपसे आगे लोग',
    btn_home: 'होम पर लौटें',

    live_grid_title: 'लाइव नेटवर्क ग्रिड',
    live_grid_sub: 'बिस्तरों की उपलब्धता और ओपीडी प्रतीक्षा समय।',
    tag_tertiary: 'तृतीयक',
    tag_phc_center: 'प्राथमिक स्वास्थ्य केंद्र',
    tag_tertiary_care: 'तृतीयक देखभाल, मल्टी-स्पेशलिटी',
    h_civil: 'सिविल अस्पताल',
    h_kamla: 'कमला नेहरू अस्पताल',
    h_aundh: 'औंध जिला अस्पताल',
    h_rajiv: 'राजीव गांधी अस्पताल',
    h_shastri: 'शास्त्री नगर PHC',
    h_aiims: 'एम्स नई दिल्ली',
    h_safdar: 'सफदरजंग अस्पताल',
    h_rml: 'आरएमएल अस्पताल',
    h_lnjp: 'लोक नायक अस्पताल',
    dash_wait_label: 'प्रतीक्षा समय',
    status_high_92: 'उच्च (92 मिनट)',
    status_low_15: 'कम (15 मिनट)',
    time_10m: '10 मिनट पहले',
    time_45m: '45 मिनट पहले',
    tip_saved: 'औसत समय बचाया:',
    unit_mins: 'मिनट',
    unit_min: 'मिनट',

    abha_title: 'ABHA लिंक करें',

    hs_title: 'अस्पताल नेटवर्क स्थिति',
    hs_subtitle:
      'अपने क्षेत्र में सरकारी अस्पतालों की वास्तविक समय स्थिति। सबसे कम प्रतीक्षा समय वाली सुविधा का पता लगाएं।',
    hs_notif: 'अस्पताल सूचनाएं',
    notif_1_title: 'एम्स में प्रतीक्षा समय अधिक',
    notif_1_body: 'आपातकालीन न होने पर नजदीकी PHC जाने पर विचार करें',
    notif_2_title: 'सफदरजंग PHC में अतिरिक्त डॉक्टर',
    notif_2_body: 'शाम 6 बजे तक 2 और जीपी उपलब्ध हैं',
    hs_tip_title: 'आज का स्वास्थ्य सुझाव',
    hs_tip_body:
      'सामान्य सर्दी और हल्के बुखार के लिए, बड़े अस्पताल जाने की तुलना में प्राथमिक स्वास्थ्य केंद्र जाना तेज़ और अधिक कुशल है। PHC 80% सामान्य बीमारियों का इलाज कर सकते हैं।',
    res_title: 'आपातकालीन और स्वास्थ्य संसाधन',
    res_subtitle: 'आपातकालीन सेवाओं और महत्वपूर्ण स्वास्थ्य जानकारी तक त्वरित पहुंच।',
    res_emerg_title: 'आपातकालीन सेवाएं',
    res_emerg_desc:
      'जीवन के लिए खतरा वाली स्थितियों के लिए, सीधे आपातकालीन स्थिति में जाएं या तुरंत कॉल करें।',
    btn_call_amb: '108 पर कॉल करें (एम्बुलेंस)',
    btn_near_er: 'निकटतम आपातकालीन कक्ष',
    btn_directions: 'दिशा - निर्देश प्राप्त करें',
    res_avail_doc: 'उपलब्ध डॉक्टर',
    res_distance: 'दूरी',

    appt_1_title: 'डॉ. ए. शर्मा - सामान्य चिकित्सा',
    appt_today: 'आज, 2:30 बजे',
    appt_1_loc: 'एम्स दिल्ली, कक्ष 205',
    btn_view_queue: 'कतार देखें',
    appt_2_title: 'रक्त परीक्षण - फॉलो अप',
    appt_tmrw: 'कल, 10:00 बजे',
    appt_2_loc: 'सफदरजंग PHC, लैब कक्ष 3',
    btn_reschedule: 'पुनर्निर्धारित करें',

    tl_1_date: 'जनवरी 2024',
    tl_1_title: 'ABDM के साथ एकीकृत',
    tl_1_desc: 'अब आयुष्मान भारत डिजिटल मिशन पारिस्थितिकी तंत्र के साथ संगत',
    tl_2_date: 'नवंबर 2023',
    tl_2_title: '5 राज्यों में विस्तारित',
    tl_2_desc: 'महाराष्ट्र, गुजरात, राजस्थान, उत्तर प्रदेश और दिल्ली में लॉन्च किया गया',
    tl_3_date: 'अगस्त 2023',
    tl_3_title: 'एआई ट्राइएज सटीकता 94% तक सुधरी',
    tl_3_desc: 'मशीन लर्निंग के साथ उन्नत लक्षण विश्लेषण एल्गोरिदम',
    foot_desc:
      'भारतीय सरकारी अस्पतालों के लिए एक बुद्धिमान ट्राइएज और प्रतीक्षा-समय भविष्यवाणी प्रणाली, जो प्रतीक्षा समय को 40% तक कम करती है।',
    foot_copy: '© 2024 मेडकतार। स्वास्थ्य एवं परिवार कल्याण मंत्रालय के सहयोग से विकसित।',
    foot_links: 'त्वरित लिंक',
    foot_contact: 'संपर्क करें',
    foot_addr: 'स्वास्थ्य मंत्रालय, नई दिल्ली',
  },
};

let currentLang = 'en';

function toggleLangMenu() {
  document.getElementById('lang-menu').classList.toggle('show');
}

function setLanguage(lang) {
  currentLang = lang;
  const labels = { en: 'EN', hi: 'HI' };
  document.getElementById('current-lang-label').innerText = labels[lang];
  document.getElementById('lang-menu').classList.remove('show');
  const t = translations[lang];

  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    if (t[key]) {
      if (key === 'hero_title') el.innerHTML = t[key];
      else if (el.tagName === 'OPTION') el.text = t[key];
      else el.innerText = t[key];
    }
  });

  document.getElementById('p-name').placeholder = t.placeholder_name;
  document.getElementById('p-age').placeholder = t.placeholder_age;
  document.getElementById('manual-symptoms').placeholder = t.placeholder_desc;
}

window.onclick = function (event) {
  if (!event.target.matches('.nav-btn') && !event.target.matches('.nav-btn *')) {
    const dropdowns = document.getElementsByClassName('lang-menu');
    for (let i = 0; i < dropdowns.length; i++) {
      const openDropdown = dropdowns[i];
      if (openDropdown.classList.contains('show')) openDropdown.classList.remove('show');
    }
  }
};

function switchTab(tabId) {
  const appSections = ['home', 'registration', 'tracking', 'status', 'abha'];
  appSections.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  });
  const target = document.getElementById(tabId);
  if (target) {
    target.classList.remove('hidden');
    target.classList.add('animate-in');
  }
  document.querySelectorAll('.nav-btn').forEach((b) => b.classList.remove('active'));
  const btns = document.querySelectorAll('.nav-btn');
  btns.forEach((btn) => {
    if (btn.getAttribute('onclick') && btn.getAttribute('onclick').includes(tabId)) {
      btn.classList.add('active');
    }
  });
  window.scrollTo(0, 0);
}

function toggleSym(el, sym) {
  el.classList.toggle('selected');
  if (symptoms.includes(sym)) symptoms = symptoms.filter((s) => s !== sym);
  else symptoms.push(sym);
}

function setStep(step) {
  for (let i = 1; i <= 4; i++) {
    document.getElementById(`reg-step-${i}`).classList.add('hidden');
    document.getElementById(`step-ind-${i}`).classList.remove('active', 'completed');
  }
  document.getElementById(`reg-step-${step}`).classList.remove('hidden');
  for (let i = 1; i <= 4; i++) {
    const ind = document.getElementById(`step-ind-${i}`);
    if (i < step) ind.classList.add('completed');
    if (i === step) ind.classList.add('active');
  }
}

// ---- Symptoms / triage (calls the backend API) ----------------
async function processSymptoms() {
  const adviceDiv = document.getElementById('advice-content');

  if (symptoms.length === 0) {
    alert('Please select at least one symptom.');
    return;
  }

  const description = document.getElementById('manual-symptoms').value.trim();
  const ageInput = document.getElementById('p-age');

  const payload = { symptoms: [...symptoms] };
  if (description) payload.description = description;
  if (ageInput && ageInput.value) payload.age = Number(ageInput.value);

  showLoading(adviceDiv, 'Analyzing your symptoms...');

  try {
    const result = await assessSymptoms(payload);
    renderAdvice(result.data ?? result);
  } catch (err) {
    showError(adviceDiv, friendlyError(err), 'Triage assessment is not available yet.');
  }
}

function renderAdvice(result) {
  const adviceDiv = document.getElementById('advice-content');
  const t = translations[currentLang];

  const emergency = Boolean(result.isEmergency);
  const recommendedHospital = result.recommendedHospital || '';
  const waitTime = result.waitTimeEstimate || '';
  const priority = result.priority || '';
  const severity = result.severity || '';
  const disclaimer = result.disclaimer || '';

  if (emergency) {
    adviceDiv.innerHTML = `
                    <div style="background:rgba(239, 68, 68, 0.1); border:1px solid var(--danger); padding:30px; border-radius:20px; text-align:center; margin-bottom:30px;">
                        <i class="fa-solid fa-triangle-exclamation" style="font-size:3rem; color:var(--danger); margin-bottom:15px;"></i>
                        <h3 style="color:var(--danger); margin-bottom:10px;">${t.advice_tertiary_title}</h3>
                        <p style="color:var(--text-muted); margin-bottom:20px;">${escapeHtml(result.message || t.advice_tertiary_msg)}</p>
                        <div style="margin-top:20px; display:flex; gap:10px;">
                            <button class="btn-xl btn-glass" style="flex:1; justify-content:center;" onclick="setStep(1)">
                                <i class="fa-solid fa-arrow-left" style="margin-right:10px;"></i> ${t.btn_back_sym}
                            </button>
                            <button class="btn-xl btn-primary" style="flex:1; justify-content:center;" onclick="window.open('tel:108')">
                                <i class="fa-solid fa-phone" style="margin-right:10px;"></i> ${t.btn_call_amb}
                            </button>
                        </div>
                        <p style="color:var(--text-muted); font-size:0.8rem; margin-top:20px;">${escapeHtml(disclaimer)}</p>
                    </div>`;
    return;
  }

  adviceDiv.innerHTML = `
                <div style="background:rgba(2, 132, 199, 0.1); border:1px solid var(--primary); padding:30px; border-radius:20px; text-align:center; margin-bottom:30px;">
                    <i class="fa-solid fa-check-circle" style="font-size:3rem; color:var(--primary); margin-bottom:15px;"></i>
                    <h3 style="color:var(--primary); margin-bottom:10px;">${escapeHtml(result.message || t.advice_phc_title)}</h3>
                    <p style="color:var(--text-muted); margin-bottom:20px;">${t.advice_phc_msg}</p>
                    <div style="background:rgba(255,255,255,0.8); padding:20px; border-radius:15px; text-align:left; border:1px solid var(--glass-border); display:flex; justify-content:space-between; align-items:center; box-shadow: 0 4px 15px rgba(0,0,0,0.05);">
                        <div>
                            <div style="font-weight:700; font-size:1.2rem; color:var(--text-main);">${escapeHtml(recommendedHospital)}</div>
                            <div style="font-size:0.9rem; color:var(--primary);">${t.status_fast_track} (${escapeHtml(waitTime)})</div>
                            <div style="font-size:0.85rem; color:var(--text-muted); margin-top:4px;">Priority: ${escapeHtml(priority)} · Severity: ${escapeHtml(severity)}</div>
                        </div>
                    </div>
                    <div style="margin-top:20px; display:flex; gap:10px;">
                        <button class="btn-xl btn-glass" style="flex:1; justify-content:center;" onclick="setStep(1)">
                            <i class="fa-solid fa-arrow-left" style="margin-right:10px;"></i> ${t.btn_back_sym}
                        </button>
                        <button class="btn-xl btn-primary" style="flex:1; justify-content:center;" onclick="confirmHospital(${JSON.stringify(recommendedHospital)})">
                            <i class="fa-solid fa-calendar-check" style="margin-right:10px;"></i> ${t.btn_book_here}
                        </button>
                    </div>
                    <p style="color:var(--text-muted); font-size:0.8rem; margin-top:20px;">${escapeHtml(disclaimer)}</p>
                </div>`;
}

// ---- Token generation (calls the backend API) -----------------
async function generateReceipt() {
  const name = document.getElementById('p-name').value.trim();
  const age = document.getElementById('p-age').value;
  const dept = document.getElementById('p-dept').value;
  const selectedHosp = document.getElementById('p-hospital-select').value;
  const btn = document.querySelector('#reg-step-3 .btn-primary');
  const originalLabel = btn ? btn.innerHTML : '';

  if (!name) {
    alert('Please enter patient name');
    return;
  }

  const payload = {
    name,
    age: age ? Number(age) : undefined,
    hospital: selectedHosp,
    department: dept,
  };

  if (btn) btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Generating...';

  try {
    const result = await createToken(payload);
    renderTokenTicket(result.data ?? result);
    setStep(4);
  } catch (err) {
    showStepError('reg-step-3', friendlyError(err), 'Token generation is not available yet.');
  } finally {
    if (btn) btn.innerHTML = originalLabel;
  }
}

function renderTokenTicket(data) {
  const setText = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.innerText = value || '';
  };

  const tokenNo = data.tokenNo || data.token?.tokenNo || '';
  const patientName = data.patientName || data.token?.patientName || '';
  const hospital = data.hospital || data.token?.hospital || '';
  const department = data.department || data.token?.department || '';

  setText('r-token', tokenNo);
  setText('r-name', patientName);
  setText('r-hosp', hospital);
  setText('r-dept', department);
  setText('r-date', data.validFor || new Date().toLocaleDateString());
  setText('track-user-token', tokenNo);
}

// ---- Token tracking (calls the backend API) -------------------
async function refreshTokenStatus() {
  const tokenEl = document.getElementById('track-user-token');
  const tokenNo = tokenEl ? tokenEl.innerText.trim() : '';

  if (!tokenNo || tokenNo === '--') {
    alert('No token to track yet. Book an OPD appointment first.');
    return;
  }

  try {
    const result = await getTokenStatus(tokenNo);
    renderTokenStatus(result.data ?? result);
  } catch (err) {
    if (err.code === 'NOT_FOUND') {
      alert('Token "' + tokenNo + '" was not found.');
    } else {
      alert(friendlyError(err));
    }
  }
}

function renderTokenStatus(data) {
  const setText = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.innerText = value || '--';
  };

  setText('track-user-token', data.tokenNo || '--');
  setText('track-current-token', data.nowServing || '--');
  setText('track-time', data.estimate || '--');
}

// ---- ABHA (real linking is a future phase) --------------------
function sendOtp() {
  const abhaInput = document.getElementById('abha-input').value;
  if (abhaInput.length < 10) {
    alert('Please enter a valid ABHA number');
    return;
  }
  showStepError(
    'abha-step-1',
    'ABHA linking is not connected yet.',
    'This feature is planned for a future phase.'
  );
}

function verifyOtp() {
  showStepError(
    'abha-step-2',
    'ABHA linking is not connected yet.',
    'This feature is planned for a future phase.'
  );
}

function confirmHospital(hospName) {
  document.getElementById('selected-hospital-label').innerText = hospName;
  document.getElementById('p-hospital-select').value = hospName;
  setStep(3);
}

function moveFocus(current, nextFieldID) {
  if (current.value.length >= 1) {
    if (nextFieldID) {
      document.getElementById(nextFieldID).focus();
    }
  }
}

function resetAbha() {
  document.getElementById('abha-step-2').classList.add('hidden');
  document.getElementById('abha-step-1').classList.remove('hidden');
  document.querySelector('#abha-step-1 .btn-primary').innerHTML =
    'Send OTP <i class="fa-solid fa-paper-plane" style="margin-left: 10px;"></i>';
}
