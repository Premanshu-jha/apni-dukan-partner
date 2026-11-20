// The offline page in the language chosen in the app (the app keeps it in localStorage "language"). English is in the
// page itself; a language missing here stays English. Names, like Clozest Partner, stay as they are.
;(function () {
  var TEXTS = {
    hi: {
      title: 'आप ऑफ़लाइन हैं · Clozest Partner',
      heading: 'आप ऑफ़लाइन हैं',
      body: 'आपके सैलून का दिन दिखाने के लिए Clozest Partner को इंटरनेट चाहिए। अपना इंटरनेट देखें, फिर कोशिश करें।',
      retry: 'फिर कोशिश करें',
    },
    te: {
      title: 'మీరు ఆఫ్‌లైన్‌లో ఉన్నారు · Clozest Partner',
      heading: 'మీరు ఆఫ్‌లైన్‌లో ఉన్నారు',
      body: 'మీ సెలూన్ రోజు చూపించడానికి Clozest Partner కి ఇంటర్నెట్ కావాలి. మీ ఇంటర్నెట్ చూసి, మళ్లీ ప్రయత్నించండి.',
      retry: 'మళ్లీ ప్రయత్నించండి',
    },
    mr: {
      title: 'तुम्ही ऑफलाइन आहात · Clozest Partner',
      heading: 'तुम्ही ऑफलाइन आहात',
      body: 'तुमच्या सलूनचा दिवस दाखवण्यासाठी Clozest Partner ला इंटरनेट लागते. तुमचे इंटरनेट तपासा, मग पुन्हा प्रयत्न करा.',
      retry: 'पुन्हा प्रयत्न करा',
    },
    ta: {
      title: 'நீங்கள் ஆஃப்லைனில் இருக்கிறீர்கள் · Clozest Partner',
      heading: 'நீங்கள் ஆஃப்லைனில் இருக்கிறீர்கள்',
      body: 'உங்கள் சலூனின் நாளைக் காட்ட Clozest Partner-க்கு இன்டர்நெட் வேண்டும். உங்கள் இன்டர்நெட்டைப் பார்த்துவிட்டு மீண்டும் முயலுங்கள்.',
      retry: 'மீண்டும் முயலுங்கள்',
    },
    kn: {
      title: 'ನೀವು ಆಫ್‌ಲೈನ್‌ನಲ್ಲಿದ್ದೀರಿ · Clozest Partner',
      heading: 'ನೀವು ಆಫ್‌ಲೈನ್‌ನಲ್ಲಿದ್ದೀರಿ',
      body: 'ನಿಮ್ಮ ಸಲೂನ್‌ನ ದಿನ ತೋರಿಸಲು Clozest Partner ಗೆ ಇಂಟರ್ನೆಟ್ ಬೇಕು. ನಿಮ್ಮ ಇಂಟರ್ನೆಟ್ ನೋಡಿ, ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.',
      retry: 'ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ',
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
})()
