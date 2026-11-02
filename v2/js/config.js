/* 질문과수원 2 — 설정. URL 파라미터를 읽어 QO.cfg 를 만든다(맨 먼저 읽히는 파일). */
window.QO = window.QO || {};
(function(){
  'use strict';
  var p = new URLSearchParams(location.search);
  var on = function(k){ var v = p.get(k); return v != null && v !== '0' && v !== 'false'; };
  var page = document.documentElement.getAttribute('data-page') || 'student';
  var selftest = on('selftest');
  var qid = Number(p.get('q'));
  window.QO.cfg = {
    url: 'https://hmzklbrksfdhzsgwzfyg.supabase.co',
    key: 'sb_publishable_OFVhbjVPbJiMWXVz2nKQuw_m6RmVVZE',     // 옛 index.html HAENURI_CONFIG 와 같은 값
    domain: 'haenuri.app',
    sbLib: 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js',
    page: page,                                   // 'student'(index.html) · 'teacher'(teacher.html)
    mock: on('mock') || selftest,                 // 시험은 언제나 흉내 DB 로
    selftest: selftest,
    debug: on('debug') || selftest,
    slow: on('slow'),                             // selftest 에서도 흉내 지연을 80~200ms 그대로
    as: p.get('as') ? String(p.get('as')).trim().toUpperCase() : null,
    tab: p.get('tab') || null,
    q: qid > 0 ? qid : null,
    shot: p.get('shot') || null                   // 'phone' 이면 폭 375px 고정(캡처용)
  };
})();
