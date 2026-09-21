#!/usr/bin/env node

/**
 * Login/Register script - Lấy JWT token từ API
 * Lưu token vào localStorage key: bt_access_token
 */

const action = process.argv[2] || 'login'; // 'login' or 'register'
const email = process.argv[3] || 'customer@btstore.local';
const password = process.argv[4] || 'password';

const endpoint = action === 'register' ? '/auth/register' : '/auth/login';
const body = action === 'register' 
  ? { email, password, fullName: 'Test User', phone: '0900000000' }
  : { email, password };

console.log(`🔐 ${action === 'register' ? 'Registering' : 'Logging in'} as: ${email}`);

fetch(`http://localhost:3000/api/v1${endpoint}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body)
})
  .then(res => res.json())
  .then(data => {
    if (data.success && data.data?.accessToken) {
      const token = data.data.accessToken;
      console.log(`✅ ${action === 'register' ? 'Registration' : 'Login'} successful!\n`);
      console.log(`Access Token:\n${token}\n`);
      console.log(`🔧 To set token in browser localStorage, run this in console:\n`);
      console.log(`localStorage.setItem('bt_access_token', '${token}');`);
      console.log(`\n✅ After setting token, refresh the page and try checkout`);
    } else {
      console.error('❌ Request failed:', data.message || 'Unknown error');
      process.exit(1);
    }
  })
  .catch(err => {
    console.error('❌ Error:', err.message);
    process.exit(1);
  });
