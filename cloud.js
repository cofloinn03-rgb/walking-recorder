const $ = id => document.getElementById(id);
const form = $('login-form');
const status = $('cloud-status');
const result = $('cloud-result');
let auth, db, api, user = null, busy = false, ready = false;

function controls() {
  $('sign-in').disabled = !ready || busy;
  $('test-upload').disabled = !ready || busy || !user;
  $('sign-out').disabled = !ready || busy || !user;
  $('email').disabled = busy;
  $('password').disabled = busy;
  form.hidden = !!user;
  $('cloud-user').textContent = user ? `Signed in: ${user.email}` : '';
}
function explain(error) {
  const code = error.code || '';
  if (['auth/invalid-credential','auth/wrong-password','auth/user-not-found','auth/invalid-email'].includes(code)) return 'Sign-in failed. Check the email and password of the user you created in Firebase Authentication.';
  if (code === 'auth/operation-not-allowed') return 'Enable Email/Password in Firebase Authentication → Sign-in method.';
  if (code === 'auth/too-many-requests') return 'Too many sign-in attempts. Wait before trying again.';
  if (code === 'auth/user-disabled') return 'This Firebase user is disabled. Check Authentication → Users.';
  if (code === 'auth/unauthorized-domain') return 'Add your GitHub Pages hostname to Firebase Authentication → Settings → Authorized domains.';
  if (/permission.denied/i.test(code + ' ' + error.message)) return 'Database access denied. Publish the supplied Realtime Database rules and check you are signed in to this project.';
  if (code === 'auth/network-request-failed') return 'Network error. Check your internet connection and retry.';
  return `Cloud operation failed${code ? ` (${code})` : ''}. Check the internet connection and Firebase setup.`;
}

async function load() {
  try {
    const [appSDK, authSDK, dbSDK] = await Promise.all([
      import('https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js'),
      import('https://www.gstatic.com/firebasejs/13.1.0/firebase-database.js')
    ]);
    api = {...authSDK, ...dbSDK};
    const app = appSDK.initializeApp({
      apiKey: 'AIzaSyDlkdkdGeyj_F-bUYENmN_5pRStwbnxVvY',
      authDomain: 'urban-walk-buddy.firebaseapp.com',
      databaseURL: 'https://urban-walk-buddy-default-rtdb.europe-west1.firebasedatabase.app',
      projectId: 'urban-walk-buddy',
      storageBucket: 'urban-walk-buddy.firebasestorage.app',
      messagingSenderId: '691279631502',
      appId: '1:691279631502:web:2756b97f054fd46ff425df'
    });
    auth = api.getAuth(app);
    db = api.getDatabase(app);
    await api.setPersistence(auth, api.browserSessionPersistence);
    api.onAuthStateChanged(auth, account => {
      user = account;
      ready = true;
      if (!busy) status.textContent = user ? 'Signed in. Ready to test cloud storage.' : 'Sign in using the Firebase user you created.';
      controls();
    }, error => {
      ready = false;
      status.textContent = explain(error);
      controls();
    });
  } catch {
    status.textContent = 'Firebase could not load. Use your HTTPS website with internet access, check that cloud.js uploaded, and reload. CSV recording remains available.';
    controls();
  }
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (!ready || busy) return;
  busy = true; controls(); result.textContent = '';
  status.textContent = 'Signing in…';
  try {
    await api.signInWithEmailAndPassword(auth, $('email').value.trim(), $('password').value);
    status.textContent = 'Signed in. Select Test cloud connection.';
  } catch (error) { status.textContent = explain(error); }
  finally { $('password').value = ''; busy = false; controls(); }
});

$('sign-out').addEventListener('click', async () => {
  if (!ready || busy) return;
  busy = true; controls();
  try {
    await api.signOut(auth);
    result.textContent = '';
    status.textContent = 'Signed out.';
  } catch (error) { status.textContent = explain(error); }
  finally { busy = false; controls(); }
});

$('test-upload').addEventListener('click', async () => {
  if (!ready || busy || !user) return;
  if (!navigator.onLine) { status.textContent = 'You appear offline. Connect to the internet before testing.'; return; }
  const account = user;
  const target = api.push(api.ref(db, `users/${account.uid}/connectionTests`));
  const checkId = target.key;
  busy = true; controls();
  status.textContent = 'Sending connection check; waiting for server acknowledgement…';
  result.textContent = `Database path: ${target.toString()}`;
  // This timer reports a delay only: it must not falsely cancel an in-flight write.
  const slow = setTimeout(() => {
    status.textContent = 'Still waiting for confirmation. A write may be pending. Keep this page open and restore your connection; no cloud success has been confirmed.';
  }, 15000);
  try {
    await api.set(target, {
      kind: 'connection-test',
      checkId,
      message: 'Firebase connection check — not a sensor measurement',
      clientTime: new Date().toISOString(),
      serverTime: api.serverTimestamp()
    });
    const snapshot = await api.get(target);
    const saved = snapshot.val();
    if (!snapshot.exists() || saved.checkId !== checkId || saved.kind !== 'connection-test' || typeof saved.serverTime !== 'number') {
      throw new Error('Read-back mismatch');
    }
    status.textContent = 'Success: Firebase acknowledged the write and the stored record was read back correctly.';
    result.textContent = `Verified at ${new Date(saved.serverTime).toISOString()}. Find it in Realtime Database → Data → users → ${account.uid} → connectionTests → ${checkId}. Walking readings have not been uploaded.`;
  } catch (error) {
    status.textContent = explain(error) + ' The check was not verified; inspect the displayed database path before retrying.';
  } finally { clearTimeout(slow); busy = false; controls(); }
});

controls();
load();
