const bcrypt = require('bcryptjs');

async function generateHash() {
  const password = 'password';
  const hash = await bcrypt.hash(password, 10);
  console.log(`Correct hash for password "password":`);
  console.log(hash);
}

generateHash();
