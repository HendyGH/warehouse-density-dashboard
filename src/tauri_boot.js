(function(){
  var T = window.__TAURI__;
  if(!(T && T.core && typeof T.core.invoke === 'function')) return; // not in Tauri -> run app normally
  var invoke = T.core.invoke;

  // ===== global state =====
  var MEM = {};
  var ROLE = null;               // 'admin' | 'editor' | 'viewer'
  var CURRENT_USER = null;
  var SETTINGS = { idleLogoutMin: 15, maxFailed: 5, minPassword: 6 };
  var saveTimer = null, idleTimer = null, lastEditLog = 0;
  var STATE_FILE = 'warehouse_state_v35.json';
  var USERS_FILE = 'users_v35.json';
  var AUDIT_FILE = 'audit_v35.json';
  var ROLE_LABELS = { admin: 'Administrator', editor: 'Editor', viewer: 'Viewer' };

  function nowISO(){ return new Date().toISOString(); }
  function fmt(iso){ if(!iso) return '-'; try { return new Date(iso).toLocaleString(); } catch(e){ return iso; } }
  function canEdit(){ return ROLE === 'admin' || ROLE === 'editor'; }
  function isAdmin(){ return ROLE === 'admin'; }
  function roleLabel(r){ return ROLE_LABELS[r] || r; }

  // ===== localStorage redirected to shared file =====
  function scheduleSave(){
    if(!canEdit()) return;
    if(saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(function(){
      saveTimer = null;
      try {
        invoke('write_file_named', { name: STATE_FILE, content: JSON.stringify(MEM) });
        var t = Date.now(); if(t - lastEditLog > 60000){ lastEditLog = t; logAudit('edit_data', ''); }
      } catch(e){ console.error('save failed', e); }
    }, 800);
  }
  Storage.prototype.getItem = function(k){ return Object.prototype.hasOwnProperty.call(MEM,k) ? MEM[k] : null; };
  Storage.prototype.setItem = function(k,v){ if(!canEdit()) return; MEM[k] = String(v); scheduleSave(); };
  Storage.prototype.removeItem = function(k){ if(!canEdit()) return; delete MEM[k]; scheduleSave(); };
  Storage.prototype.clear = function(){ if(!canEdit()) return; MEM = {}; scheduleSave(); };
  Storage.prototype.key = function(i){ var ks = Object.keys(MEM); return i < ks.length ? ks[i] : null; };

  // ===== UI helpers =====
  function domReady(){ return new Promise(function(res){ if(document.readyState !== 'loading') res(); else document.addEventListener('DOMContentLoaded', function(){ res(); }); }); }
  function el(tag, css, txt){ var e = document.createElement(tag); if(css) e.style.cssText = css; if(txt != null) e.textContent = txt; return e; }
  var overlay, overlayBox;
  function ensureOverlay(){
    if(overlay) return;
    overlay = el('div', 'position:fixed;inset:0;z-index:2147483000;background:#0f172a;display:flex;align-items:center;justify-content:center;font-family:sans-serif;overflow:auto;padding:20px');
    overlayBox = el('div', 'background:#fff;border-radius:16px;padding:28px;width:380px;max-width:94vw;box-shadow:0 20px 60px rgba(0,0,0,.4)');
    overlay.appendChild(overlayBox);
    document.body.appendChild(overlay);
  }
  function setOverlay(nodes, width){ ensureOverlay(); overlayBox.style.width = (width||380)+'px'; overlayBox.innerHTML = ''; nodes.forEach(function(n){ overlayBox.appendChild(n); }); overlay.style.display = 'flex'; }
  function hideOverlay(){ if(overlay) overlay.style.display = 'none'; }
  function title(t){ return el('div', 'font-size:18px;font-weight:800;color:#0f172a;margin-bottom:6px', t); }
  function sub(t){ return el('div', 'font-size:12px;color:#64748b;margin-bottom:16px;line-height:1.5', t); }
  function label(t){ return el('div', 'font-size:11px;font-weight:700;color:#334155;margin:10px 0 4px;text-transform:uppercase;letter-spacing:.04em', t); }
  function input(type, ph){ var i = el('input'); i.type = type || 'text'; if(ph) i.placeholder = ph; i.style.cssText = 'width:100%;padding:10px 12px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;box-sizing:border-box'; return i; }
  function selectBox(opts){ var s = el('select'); s.style.cssText = 'width:100%;padding:10px 12px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;box-sizing:border-box'; opts.forEach(function(o){ var op = el('option', null, o[1]); op.value = o[0]; s.appendChild(op); }); return s; }
  function button(t, primary){ var b = el('button', 'width:100%;padding:11px;border:0;border-radius:8px;font-weight:800;font-size:13px;cursor:pointer;margin-top:12px;' + (primary ? 'background:#7c3aed;color:#fff' : 'background:#e2e8f0;color:#0f172a'), t); b.type = 'button'; return b; }
  function errline(){ return el('div', 'color:#dc2626;font-size:12px;font-weight:600;margin-top:10px;min-height:16px'); }

  // ===== crypto PBKDF2 SHA-256 =====
  function b64(bytes){ var s=''; for(var i=0;i<bytes.length;i++) s += String.fromCharCode(bytes[i]); return btoa(s); }
  function unb64(str){ var s=atob(str); var a=new Uint8Array(s.length); for(var i=0;i<s.length;i++) a[i]=s.charCodeAt(i); return a; }
  function randBytes(n){ var a=new Uint8Array(n); crypto.getRandomValues(a); return a; }
  function derive(password, salt, iterations){
    var enc = new TextEncoder();
    return crypto.subtle.importKey('raw', enc.encode(password), { name:'PBKDF2' }, false, ['deriveBits'])
      .then(function(key){ return crypto.subtle.deriveBits({ name:'PBKDF2', salt: salt, iterations: iterations, hash:'SHA-256' }, key, 256); })
      .then(function(bits){ return new Uint8Array(bits); });
  }
  function setPassword(user, password){
    var salt = randBytes(16); var iter = 120000;
    return derive(password, salt, iter).then(function(h){ user.salt = b64(salt); user.hash = b64(h); user.iter = iter; return user; });
  }
  function verify(user, password){
    return derive(password, unb64(user.salt), user.iter || 120000).then(function(h){ return b64(h) === user.hash; });
  }

  // ===== integrity (HMAC tamper-detection) =====
  // Embedded secret. Editing the accounts file by hand (e.g. changing a role
  // from viewer to admin in Notepad) breaks this signature and is rejected.
  var APP_SECRET = 'WD35::a7F3-c19E-4b02-9d8A::role-integrity::do-not-change-after-deploy';
  function hmacKey(){
    var enc = new TextEncoder();
    return crypto.subtle.importKey('raw', enc.encode(APP_SECRET), { name:'HMAC', hash:'SHA-256' }, false, ['sign']);
  }
  function usersPayload(obj){ return JSON.stringify({ users: obj.users || [], settings: obj.settings || {} }); }
  function computeSig(obj){
    var enc = new TextEncoder();
    return hmacKey().then(function(k){ return crypto.subtle.sign('HMAC', k, enc.encode(usersPayload(obj))); }).then(function(sig){ return b64(new Uint8Array(sig)); });
  }

  // ===== IO users + audit =====
  function loadUsers(){
    return invoke('read_file_named', { name: USERS_FILE }).then(function(s){
      var obj = { users: [] };
      if(s){ try { obj = JSON.parse(s); } catch(e){ obj = { users: [] }; } }
      if(!obj.users) obj.users = [];
      if(!obj.settings) obj.settings = {};
      obj.settings.idleLogoutMin = (obj.settings.idleLogoutMin != null) ? obj.settings.idleLogoutMin : SETTINGS.idleLogoutMin;
      obj.settings.maxFailed = obj.settings.maxFailed || SETTINGS.maxFailed;
      obj.settings.minPassword = obj.settings.minPassword || SETTINGS.minPassword;
      SETTINGS = obj.settings;
      if(obj.users.length === 0){ return obj; }
      var provided = obj.__sig;
      return computeSig(obj).then(function(expected){
        if(!provided || provided !== expected){
          var err = new Error('Security check failed: the accounts file (' + USERS_FILE + ') was modified outside the app and cannot be trusted, so access is blocked to protect account roles.\n\nRestore the accounts file from a trusted backup.\n\nIf you are upgrading from an older version without a security signature, delete ' + USERS_FILE + ' in the database folder and reopen the app to recreate the administrator.');
          err.__tamper = true;
          throw err;
        }
        return obj;
      });
    });
  }
  function saveUsers(obj){
    return computeSig(obj).then(function(sig){
      var out = { users: obj.users || [], settings: obj.settings || {}, __sig: sig };
      return invoke('write_file_named', { name: USERS_FILE, content: JSON.stringify(out, null, 2) });
    });
  }
  function logAudit(action, detail){
    return invoke('read_file_named', { name: AUDIT_FILE }).then(function(s){
      var arr = []; if(s){ try { arr = JSON.parse(s); } catch(e){ arr = []; } }
      if(!Array.isArray(arr)) arr = [];
      arr.push({ ts: nowISO(), user: (CURRENT_USER ? CURRENT_USER.username : '-'), action: action, detail: detail || '' });
      if(arr.length > 500) arr = arr.slice(arr.length - 500);
      return invoke('write_file_named', { name: AUDIT_FILE, content: JSON.stringify(arr, null, 2) });
    }).catch(function(e){ console.error('audit failed', e); });
  }

  // ===== flows =====
  function setupFolder(){
    return new Promise(function(resolve){
      var inp = input('text', 'paste the folder path on the server');
      var err = errline(); var save = button('Save database location', true);
      save.onclick = function(){
        var v = (inp.value || '').trim();
        if(!v){ err.textContent = 'Path cannot be empty.'; return; }
        save.disabled = true; err.textContent = '';
        invoke('set_db_folder', { path: v }).then(function(){ resolve(); }).catch(function(e){ save.disabled = false; err.textContent = 'Failed: ' + e; });
      };
      setOverlay([ title('Shared Database Location'), sub('Paste the folder location on the server (Y: drive) where data & accounts are stored together. Everyone running this app must point to the same folder.'), label('Folder path'), inp, save, err ]);
    });
  }
  function firstAdmin(){
    return new Promise(function(resolve){
      var u = input('text','admin username'), nm = input('text','full name'), dp = input('text','department');
      var p = input('password','password'), p2 = input('password','repeat password');
      var err = errline(); var save = button('Create administrator account', true);
      save.onclick = function(){
        var un = (u.value||'').trim();
        if(!un){ err.textContent='Username is required.'; return; }
        if((p.value||'').length < SETTINGS.minPassword){ err.textContent='Password must be at least '+SETTINGS.minPassword+' characters.'; return; }
        if(p.value !== p2.value){ err.textContent='Passwords do not match.'; return; }
        save.disabled = true; err.textContent='';
        var user = { username: un, role: 'admin', name:(nm.value||'').trim(), dept:(dp.value||'').trim(), active:true, forceChange:false, failed:0, locked:false, createdAt: nowISO(), lastLogin: null };
        setPassword(user, p.value).then(function(){ return saveUsers({ users:[user], settings: SETTINGS }); }).then(function(){ CURRENT_USER=user; return logAudit('create_first_admin', un); }).then(function(){ CURRENT_USER=null; resolve(); }).catch(function(e){ save.disabled=false; err.textContent='Failed: '+e; });
      };
      setOverlay([ title('Create First Administrator'), sub('No account exists yet. This first account becomes the administrator (can edit data & manage accounts).'), label('Username'), u, label('Full name'), nm, label('Department'), dp, label('Password'), p, label('Repeat password'), p2, save, err ]);
    });
  }
  function changePassword(user, firstTime){
    return new Promise(function(resolve){
      var oldp = firstTime ? null : input('password','current password');
      var np = input('password','new password'), np2 = input('password','repeat new password');
      var err = errline(); var save = button(firstTime ? 'Save & continue' : 'Change password', true);
      var cancel = firstTime ? null : button('Cancel', false);
      if(cancel){ cancel.onclick = function(){ resolve(false); }; }
      save.onclick = function(){
        if((np.value||'').length < SETTINGS.minPassword){ err.textContent='New password must be at least '+SETTINGS.minPassword+' characters.'; return; }
        if(np.value !== np2.value){ err.textContent='New passwords do not match.'; return; }
        save.disabled = true; err.textContent='';
        var chain = firstTime ? Promise.resolve(true) : verify(user, oldp.value);
        chain.then(function(ok){
          if(!ok){ save.disabled=false; err.textContent='Current password is incorrect.'; return; }
          return loadUsers().then(function(obj){
            var f = (obj.users||[]).filter(function(x){ return x.username === user.username; })[0];
            if(!f){ err.textContent='Account not found.'; return; }
            return setPassword(f, np.value).then(function(){ f.forceChange = false; return saveUsers(obj); }).then(function(){ user.salt=f.salt; user.hash=f.hash; user.iter=f.iter; user.forceChange=false; return logAudit('change_password', user.username); }).then(function(){ resolve(true); });
          });
        }).catch(function(e){ save.disabled=false; err.textContent='Failed: '+e; });
      };
      var head = firstTime ? [ title('Password Change Required'), sub('This is your first login. For security, set your own new password (administrators cannot see passwords).') ] : [ title('Change Password'), sub('Change your own account password.') ];
      var body = firstTime ? [ label('New password'), np, label('Repeat new password'), np2, save ] : [ label('Current password'), oldp, label('New password'), np, label('Repeat new password'), np2, save, cancel ];
      setOverlay(head.concat(body).concat([err]));
    });
  }
  function login(){
    return new Promise(function(resolve){
      var u = input('text','username'), p = input('password','password');
      var err = errline(); var go = button('Sign in', true);
      function attempt(){
        var un = (u.value||'').trim();
        go.disabled = true; err.textContent='';
        loadUsers().then(function(obj){
          var found = (obj.users||[]).filter(function(x){ return x.username === un; })[0];
          if(!found){ go.disabled=false; err.textContent='Incorrect username or password.'; return; }
          if(found.locked){ go.disabled=false; err.textContent='Account locked due to too many attempts. Contact an administrator.'; return; }
          if(found.active === false){ go.disabled=false; err.textContent='Account is inactive. Contact an administrator.'; return; }
          verify(found, p.value).then(function(ok){
            if(!ok){
              found.failed = (found.failed||0) + 1;
              var msg = 'Incorrect username or password.';
              if(found.failed >= (SETTINGS.maxFailed||5)){ found.locked = true; msg = 'Account locked after '+found.failed+' failed attempts. Contact an administrator.'; }
              saveUsers(obj).then(function(){ CURRENT_USER={username:un}; logAudit(found.locked?'account_locked':'login_failed', un+' (attempt '+found.failed+')'); CURRENT_USER=null; });
              go.disabled=false; err.textContent = msg; return;
            }
            found.failed = 0; found.lastLogin = nowISO();
            CURRENT_USER = found; ROLE = found.role;
            saveUsers(obj).then(function(){ return logAudit('login', un); }).then(function(){
              if(found.forceChange){ return changePassword(found, true); }
            }).then(function(){ resolve(found); });
          }).catch(function(e){ go.disabled=false; err.textContent='Failed: '+e; });
        }).catch(function(e){ go.disabled=false; err.textContent='Failed: '+e; });
      }
      go.onclick = attempt;
      p.addEventListener('keydown', function(ev){ if(ev.key==='Enter') attempt(); });
      setOverlay([ title('Sign In'), sub('Sign in to open the dashboard. Administrators and editors can edit; viewers can only view.'), label('Username'), u, label('Password'), p, go, err ]);
    });
  }

  function lockViewerUI(){
    var BLOCKED = ['saveCurrentSnapshot','deleteLatestSnapshot','clearTrendHistory','clearMemory','openTrendHistoryImport','importTrendHistoryFile','importPutawayRulesFile','savePutawayRulesFromModal','resetPutawayRulesDraft','addPutawayRule','removePutawayRule','handleAutoSaveToggle'];
    BLOCKED.forEach(function(fn){ try { window[fn] = function(){ return false; }; } catch(e){} });
    function hideByOnclick(s){ try { var list = document.querySelectorAll('button'); for(var i=0;i<list.length;i++){ var oc = list[i].getAttribute('onclick') || ''; if(oc.indexOf(s) >= 0) list[i].style.display='none'; } } catch(e){} }
    ['rawDataInput','detailedDataInput','npiModelInput','npiMonthInput','npiStartInput'].forEach(function(id){ var e=document.getElementById(id); if(e){ e.readOnly=true; e.disabled=true; e.style.opacity='0.7'; } });
    ['btnGenerate','btnSaveSnapshot','btnAddNpi','btnCancelNpi'].forEach(function(id){ var e=document.getElementById(id); if(e){ e.style.display='none'; } });
    var ts=document.getElementById('autoSaveToggle'); if(ts){ ts.disabled=true; var lab=ts.closest ? ts.closest('label') : null; if(lab) lab.style.display='none'; }
    hideByOnclick('clearMemory'); hideByOnclick('savePutawayRulesFromModal'); hideByOnclick('addPutawayRule'); hideByOnclick('saveCurrentSnapshot');
  }

  // ===== auto-logout idle =====
  function doLogout(reason){ logAudit(reason||'logout', '').then(function(){ location.reload(); }).catch(function(){ location.reload(); }); }
  function startIdleTimer(){
    var mins = SETTINGS.idleLogoutMin;
    function reset(){ if(idleTimer) clearTimeout(idleTimer); if(!mins || mins <= 0) return; idleTimer = setTimeout(function(){ doLogout('logout_idle'); }, mins*60000); }
    ['mousemove','keydown','mousedown','touchstart','scroll','click'].forEach(function(ev){ document.addEventListener(ev, reset, true); });
    reset();
  }

  function addBadge(){
    var color = ROLE==='admin' ? '#059669' : (ROLE==='editor' ? '#2563eb' : '#7c3aed');
    var wrap = el('div', 'position:fixed;right:0;bottom:18px;z-index:2147482000;display:flex;align-items:stretch;font-family:sans-serif;');
    wrap.id = 'accountBadge';
    var tab = el('button', 'border:0;cursor:pointer;background:'+color+';color:#fff;font:800 11px sans-serif;padding:10px 8px;border-radius:10px 0 0 10px;box-shadow:0 6px 20px rgba(0,0,0,.25);writing-mode:vertical-rl;transform:rotate(180deg);letter-spacing:.08em;');
    tab.type = 'button';
    tab.textContent = 'Account';
    var panel = el('div', 'display:none;background:'+color+';color:#fff;padding:8px 12px;border-radius:12px 0 0 12px;box-shadow:0 6px 20px rgba(0,0,0,.25);align-items:center;gap:10px;flex-wrap:wrap;font:700 12px sans-serif;');
    panel.appendChild(el('span', null, (CURRENT_USER ? (CURRENT_USER.name || CURRENT_USER.username) : '') + ' - ' + roleLabel(ROLE)));
    var chg = el('span', 'cursor:pointer;text-decoration:underline', 'Change Password'); chg.onclick = function(){ changePassword(CURRENT_USER, false).then(function(){ hideOverlay(); }); }; panel.appendChild(chg);
    if(isAdmin()){ var mng = el('span', 'cursor:pointer;text-decoration:underline', 'Manage Accounts'); mng.onclick = openAccountManager; panel.appendChild(mng); }
    var out = el('span', 'cursor:pointer;text-decoration:underline', 'Sign out'); out.onclick = function(){ doLogout('logout'); }; panel.appendChild(out);
    var open = false;
    tab.onclick = function(){
      open = !open;
      panel.style.display = open ? 'flex' : 'none';
      tab.textContent = open ? 'Hide' : 'Account';
    };
    wrap.appendChild(panel);
    wrap.appendChild(tab);
    document.body.appendChild(wrap);
  }

  function openAccountManager(){
    loadUsers().then(function(obj){
      var search = input('text','search username / name / department'); search.style.marginBottom='8px';
      var tableWrap = el('div', 'max-height:260px;overflow:auto;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:8px');
      function render(){
        tableWrap.innerHTML='';
        var q = (search.value||'').toLowerCase();
        var head = el('div','display:grid;grid-template-columns:1.6fr .9fr .9fr 1.1fr 1fr;gap:6px;padding:8px 10px;background:#f8fafc;font:700 10px sans-serif;color:#475569;text-transform:uppercase;position:sticky;top:0');
        ['User','Role','Status','Last login','Actions'].forEach(function(h){ head.appendChild(el('span',null,h)); });
        tableWrap.appendChild(head);
        (obj.users||[]).filter(function(u){ return !q || (u.username+' '+(u.name||'')+' '+(u.dept||'')).toLowerCase().indexOf(q) >= 0; }).forEach(function(usr){
          var isSelf = CURRENT_USER && usr.username === CURRENT_USER.username;
          var row = el('div','display:grid;grid-template-columns:1.6fr .9fr .9fr 1.1fr 1fr;gap:6px;padding:8px 10px;border-top:1px solid #f1f5f9;font:12px sans-serif;align-items:center');
          var uc = el('div'); uc.appendChild(el('div','font-weight:700', usr.username)); uc.appendChild(el('div','color:#64748b;font-size:10px', (usr.name||'-') + (usr.dept?(' | '+usr.dept):''))); row.appendChild(uc);
          var rsel = selectBox([['viewer',ROLE_LABELS.viewer],['editor',ROLE_LABELS.editor],['admin',ROLE_LABELS.admin]]); rsel.value = usr.role; rsel.style.padding='4px 6px'; rsel.style.fontSize='11px';
          rsel.disabled = isSelf; rsel.onchange = function(){ usr.role = rsel.value; saveUsers(obj).then(function(){ logAudit('change_role', usr.username+' -> '+usr.role); }); }; row.appendChild(rsel);
          var st = el('div');
          if(usr.locked){ var unl = el('span','color:#b45309;cursor:pointer;font-weight:700','Locked - Unlock'); unl.onclick = function(){ usr.locked=false; usr.failed=0; saveUsers(obj).then(function(){ logAudit('unlock', usr.username); render(); }); }; st.appendChild(unl); }
          else { var tog = el('span', 'cursor:pointer;font-weight:700;color:' + (usr.active===false?'#dc2626':'#059669'), usr.active===false?'Inactive':'Active'); if(isSelf){ tog.style.cursor='default'; tog.style.opacity='.6'; } else { tog.onclick = function(){ usr.active = (usr.active===false); saveUsers(obj).then(function(){ logAudit(usr.active?'activate':'deactivate', usr.username); render(); }); }; } st.appendChild(tog); }
          row.appendChild(st);
          row.appendChild(el('div','color:#64748b;font-size:10px', fmt(usr.lastLogin)));
          var act = el('div','display:flex;gap:8px;flex-wrap:wrap');
          if(!isSelf){
            var rst = el('span','color:#2563eb;cursor:pointer;font-weight:700','Reset'); rst.onclick = function(){ resetPasswordFlow(obj, usr, render); }; act.appendChild(rst);
            var del = el('span','color:#dc2626;cursor:pointer;font-weight:700','Delete'); del.onclick = function(){ if(!confirm('Delete account '+usr.username+'?')) return; obj.users = obj.users.filter(function(x){ return x.username !== usr.username; }); saveUsers(obj).then(function(){ logAudit('delete_account', usr.username); render(); }); }; act.appendChild(del);
          } else { act.appendChild(el('span','color:#94a3b8;font-size:10px','(your account)')); }
          row.appendChild(act);
          tableWrap.appendChild(row);
        });
      }
      search.oninput = render; render();
      var nu = input('text','new username'), nm = input('text','full name'), dp = input('text','department'), np = input('password','temporary password');
      var role = selectBox([['viewer',ROLE_LABELS.viewer+' (view only)'],['editor',ROLE_LABELS.editor+' (can edit, no account management)'],['admin',ROLE_LABELS.admin+' (edit & manage accounts)']]);
      var err = errline(); var add = button('Add account', true);
      add.onclick = function(){
        var un = (nu.value||'').trim();
        if(!un){ err.textContent='Username is required.'; return; }
        if((obj.users||[]).some(function(x){ return x.username === un; })){ err.textContent='Username already exists.'; return; }
        if((np.value||'').length < SETTINGS.minPassword){ err.textContent='Password must be at least '+SETTINGS.minPassword+' characters.'; return; }
        add.disabled = true; err.textContent='';
        var user = { username: un, role: role.value, name:(nm.value||'').trim(), dept:(dp.value||'').trim(), active:true, forceChange:true, failed:0, locked:false, createdAt: nowISO(), lastLogin: null };
        setPassword(user, np.value).then(function(){ obj.users = obj.users || []; obj.users.push(user); return saveUsers(obj); }).then(function(){ return logAudit('create_account', un+' ('+role.value+')'); }).then(function(){ add.disabled=false; nu.value=nm.value=dp.value=np.value=''; render(); }).catch(function(e){ add.disabled=false; err.textContent='Failed: '+e; });
      };
      var idle = input('number','minutes'); idle.value = SETTINGS.idleLogoutMin; idle.style.width='80px';
      var maxf = input('number','x'); maxf.value = SETTINGS.maxFailed; maxf.style.width='80px';
      var setBtn = button('Save settings', false);
      setBtn.onclick = function(){ SETTINGS.idleLogoutMin = parseInt(idle.value,10)||0; SETTINGS.maxFailed = parseInt(maxf.value,10)||5; obj.settings = SETTINGS; saveUsers(obj).then(function(){ logAudit('change_settings', 'idle='+SETTINGS.idleLogoutMin+'m, maxFailed='+SETTINGS.maxFailed); setBtn.textContent='Saved'; setTimeout(function(){ setBtn.textContent='Save settings'; }, 1500); }); };
      var setRow = el('div','display:flex;gap:14px;align-items:flex-end;flex-wrap:wrap');
      var c1 = el('div'); c1.appendChild(label('Auto-logout idle (minutes, 0=off)')); c1.appendChild(idle); setRow.appendChild(c1);
      var c2 = el('div'); c2.appendChild(label('Lock after failed attempts (x)')); c2.appendChild(maxf); setRow.appendChild(c2);
      var auditBtn = button('View activity log', false); auditBtn.onclick = openAuditLog;
      var close = button('Close', false); close.onclick = function(){ hideOverlay(); };
      setOverlay([ title('Manage Accounts'), sub('Roles: '+ROLE_LABELS.admin+' (edit + manage accounts), '+ROLE_LABELS.editor+' (edit data only), '+ROLE_LABELS.viewer+' (view only). Administrators cannot see anyone\'s password - only Reset (set a temporary password) or Delete. New accounts must change password on first login.'), search, tableWrap, el('div','border-top:1px solid #e2e8f0;margin:6px 0 2px'), label('Add new account'), nu, nm, dp, np, role, add, err, el('div','border-top:1px solid #e2e8f0;margin:12px 0 2px'), label('Security settings'), setRow, setBtn, auditBtn, close ], 560);
    });
  }

  function resetPasswordFlow(obj, usr, done){
    var np = input('password','new temporary password'); var err = errline();
    var save = button('Reset password', true); var cancel = button('Cancel', false);
    save.onclick = function(){
      if((np.value||'').length < SETTINGS.minPassword){ err.textContent='Password must be at least '+SETTINGS.minPassword+' characters.'; return; }
      save.disabled = true;
      setPassword(usr, np.value).then(function(){ usr.forceChange = true; usr.locked = false; usr.failed = 0; return saveUsers(obj); }).then(function(){ return logAudit('reset_password', usr.username); }).then(function(){ openAccountManager(); }).catch(function(e){ save.disabled=false; err.textContent='Failed: '+e; });
    };
    cancel.onclick = function(){ openAccountManager(); };
    setOverlay([ title('Reset Password: '+usr.username), sub('Set a TEMPORARY password then tell the user. The user must change it at next login. Administrators do not see the old password.'), label('Temporary password'), np, save, cancel, err ]);
  }

  function openAuditLog(){
    invoke('read_file_named', { name: AUDIT_FILE }).then(function(s){
      var arr = []; if(s){ try { arr = JSON.parse(s); } catch(e){ arr = []; } }
      if(!Array.isArray(arr)) arr = [];
      var wrap = el('div','max-height:340px;overflow:auto;border:1px solid #e2e8f0;border-radius:8px');
      arr.slice().reverse().forEach(function(a){
        var row = el('div','padding:7px 10px;border-bottom:1px solid #f1f5f9;font:12px sans-serif');
        row.appendChild(el('span','color:#64748b;font-size:10px', fmt(a.ts)+'  '));
        row.appendChild(el('span','font-weight:700', (a.user||'-')+' '));
        row.appendChild(el('span','color:#7c3aed;font-weight:700', a.action));
        if(a.detail) row.appendChild(el('span','color:#334155', '  '+a.detail));
        wrap.appendChild(row);
      });
      if(arr.length===0) wrap.appendChild(el('div','padding:14px;color:#64748b;font-size:12px','No activity yet.'));
      var back = button('Back', false); back.onclick = openAccountManager;
      setOverlay([ title('Activity Log'), sub('History of logins, data changes, and account changes (last 500).'), wrap, back ], 560);
    });
  }

  function hydrateAndRender(){
    try {
      ['rawDataInput','detailedDataInput'].forEach(function(id){ var e=document.getElementById(id); if(e){ var v = MEM[id]; e.value = (v == null ? '' : v); } });
      function call(fn){ try { if(typeof window[fn] === 'function') window[fn](); } catch(e){ console.error(fn, e); } }
      // Re-run the app's init AFTER shared data is loaded, so snapshot history & trend reappear
      call('loadPutawaySettings');
      call('loadTrendSnapshots');
      call('setDefaultSnapshotDate');
      call('updateAutoSaveUI');
      call('updateSectionMenuUI');
      call('applyTheme'); call('applyAppView'); call('updateGeneratedStamp'); call('renderNpiLists'); call('applySectionOrder'); call('bindDashboardSectionDrag'); call('renderLabView');
      if(MEM['rawDataInput'] && typeof window.processAllData === 'function'){ window.processAllData(); }
      else { call('renderTrendDashboard'); call('populateComparisonSnapshotSelect'); call('renderOperationalActionCenter'); }
    } catch(e){ console.error(e); }
  }

  function boot(){
    domReady()
      .then(function(){ ensureOverlay(); setOverlay([ title('Loading...'), sub('Preparing the application.') ]); })
      .then(function(){ return invoke('get_config'); })
      .then(function(cfg){ if(!cfg || !cfg.db_folder){ return setupFolder(); } })
      .then(function(){ return loadUsers(); })
      .then(function(obj){ if(!obj.users || obj.users.length === 0){ return firstAdmin(); } })
      .then(function(){ return login(); })
      .then(function(){ return invoke('read_file_named', { name: STATE_FILE }); })
      .then(function(s){ var parsed = {}; if(s){ try { parsed = JSON.parse(s); } catch(e){ parsed = {}; } } MEM = parsed; })
      .then(function(){ return window.WarehouseProfileReady || Promise.resolve(); })
      .then(function(){ hydrateAndRender(); if(!canEdit()){ lockViewerUI(); } addBadge(); startIdleTimer(); hideOverlay(); })
      .catch(function(e){ ensureOverlay(); setOverlay([ title('An error occurred'), sub(String(e && e.message ? e.message : e)) ]); });
  }

  boot();
})();

