/**
 * Utility: create (or promote) an admin user in the JSON store.
 * Usage: node create-admin.js <email> <password>
 */
const store = require('./src/services/store');

const [email, password] = process.argv.slice(2);
if (!email || !password) {
  console.error('Usage: node create-admin.js <email> <password>');
  process.exit(1);
}
let user = store.findUserByEmail(email);
if (!user) user = store.createUser({ email, password });
store.updateUser(user.id, { role: 'admin' });
console.log('Admin ready:', email, '| role =', store.findUserByEmail(email).role);
