// The offline page in the language chosen in the app (the app keeps it in localStorage "language"). English is in the
// page itself; a language missing here stays English. Names, like Clozest Partner, stay as they are.
;(function () {
  var TEXTS = {
    hi: {
      title: 'आप ऑफ़लाइन हैं · Clozest Partner',
      heading: 'आप ऑफ़लाइन हैं',
      body: 'आपकी दुकान का दिन दिखाने के लिए Clozest Partner को इंटरनेट चाहिए। अपना इंटरनेट देखें, फिर कोशिश करें।',
      retry: 'फिर कोशिश करें',
      urgent: 'जल्दी है? हमें कॉल या WhatsApp करें: +91 93812 51613',
      call: 'हमें कॉल करें',
      whatsapp: 'हमें WhatsApp करें',
      hours: 'कॉल: सुबह 10 से शाम 7 बजे · WhatsApp कभी भी',
    },
    te: {
      title: 'మీరు ఆఫ్‌లైన్‌లో ఉన్నారు · Clozest Partner',
      heading: 'మీరు ఆఫ్‌లైన్‌లో ఉన్నారు',
      body: 'మీ షాప్ రోజు చూపించడానికి Clozest Partner కి ఇంటర్నెట్ కావాలి. మీ ఇంటర్నెట్ చూసి, మళ్లీ ప్రయత్నించండి.',
      retry: 'మళ్లీ ప్రయత్నించండి',
      urgent: 'అత్యవసరమా? మాకు కాల్ లేదా WhatsApp చేయండి: +91 93812 51613',
      call: 'మాకు కాల్ చేయండి',
      whatsapp: 'మాకు WhatsApp చేయండి',
      hours: 'కాల్: ఉదయం 10 నుంచి సాయంత్రం 7 వరకు · WhatsApp ఎప్పుడైనా',
    },
    mr: {
      title: 'तुम्ही ऑफलाइन आहात · Clozest Partner',
      heading: 'तुम्ही ऑफलाइन आहात',
      body: 'तुमच्या दुकानाचा दिवस दाखवण्यासाठी Clozest Partner ला इंटरनेट लागते. तुमचे इंटरनेट तपासा, मग पुन्हा प्रयत्न करा.',
      retry: 'पुन्हा प्रयत्न करा',
      urgent: 'तातडीचे आहे? आम्हाला कॉल किंवा WhatsApp करा: +91 93812 51613',
      call: 'आम्हाला कॉल करा',
      whatsapp: 'आम्हाला WhatsApp करा',
      hours: 'कॉल: सकाळी 10 ते संध्याकाळी 7 · WhatsApp कधीही',
    },
    ta: {
      title: 'நீங்கள் ஆஃப்லைனில் இருக்கிறீர்கள் · Clozest Partner',
      heading: 'நீங்கள் ஆஃப்லைனில் இருக்கிறீர்கள்',
      body: 'உங்கள் கடையின் நாளைக் காட்ட Clozest Partner-க்கு இன்டர்நெட் வேண்டும். உங்கள் இன்டர்நெட்டைப் பார்த்துவிட்டு மீண்டும் முயலுங்கள்.',
      retry: 'மீண்டும் முயலுங்கள்',
      urgent: 'அவசரமா? எங்களை அழையுங்கள் அல்லது WhatsApp செய்யுங்கள்: +91 93812 51613',
      call: 'எங்களை அழையுங்கள்',
      whatsapp: 'எங்களுக்கு WhatsApp செய்யுங்கள்',
      hours: 'அழைப்பு: காலை 10 முதல் மாலை 7 வரை · WhatsApp எப்போது வேண்டுமானாலும்',
    },
    kn: {
      title: 'ನೀವು ಆಫ್‌ಲೈನ್‌ನಲ್ಲಿದ್ದೀರಿ · Clozest Partner',
      heading: 'ನೀವು ಆಫ್‌ಲೈನ್‌ನಲ್ಲಿದ್ದೀರಿ',
      body: 'ನಿಮ್ಮ ಅಂಗಡಿಯ ದಿನ ತೋರಿಸಲು Clozest Partner ಗೆ ಇಂಟರ್ನೆಟ್ ಬೇಕು. ನಿಮ್ಮ ಇಂಟರ್ನೆಟ್ ನೋಡಿ, ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.',
      retry: 'ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ',
      urgent: 'ತುರ್ತು ಇದೆಯೇ? ನಮಗೆ ಕಾಲ್ ಅಥವಾ WhatsApp ಮಾಡಿ: +91 93812 51613',
      call: 'ನಮಗೆ ಕಾಲ್ ಮಾಡಿ',
      whatsapp: 'ನಮಗೆ WhatsApp ಮಾಡಿ',
      hours: 'ಕರೆ: ಬೆಳಿಗ್ಗೆ 10 ರಿಂದ ಸಂಜೆ 7 ರವರೆಗೆ · WhatsApp ಯಾವಾಗ ಬೇಕಾದರೂ',
    },
  }
  var lang = null
  try {
    lang = window.localStorage.getItem('language')
  } catch (e) {
    return
  }
  var t = lang && Object.prototype.hasOwnProperty.call(TEXTS, lang) ? TEXTS[lang] : null
  if (!t) return
  document.documentElement.lang = lang
  document.title = t.title
  document.getElementById('offline-heading').textContent = t.heading
  document.getElementById('offline-body').textContent = t.body
  document.getElementById('offline-retry').textContent = t.retry
  document.getElementById('offline-urgent').textContent = t.urgent
  document.getElementById('offline-call').textContent = t.call
  document.getElementById('offline-whatsapp').textContent = t.whatsapp
  document.getElementById('offline-hours').textContent = t.hours
})()
