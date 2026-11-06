const fs = require('fs');
const c = fs.readFileSync('public/index.html', 'utf8');

const checks = [
  ['complaintModal exists', c.includes('id="complaintModal"')],
  ['openComplaintModal call', c.includes('openComplaintModal')],
  ['adminSectionComplaints', c.includes('adminSectionComplaints')],
  ['submitComplaint fn', c.includes('function submitComplaint')],
  ['loadAdminComplaints fn', c.includes('function loadAdminComplaints')],
  ['escHtml fn', c.includes('function escHtml')],
  ['complaints in switcher', c.includes("'complaints'")],
  ['adminComplaintsBadge', c.includes('adminComplaintsBadge')],
  ['complaintForm', c.includes('id="complaintForm"')],
  ['body close tag', c.includes('</body>')],
  ['html close tag', c.includes('</html>')],
];

checks.forEach(([name, ok]) => console.log((ok ? '✅' : '❌') + ' ' + name));

// Count closing tags
const bodyClose = (c.match(/<\/body>/g) || []).length;
const htmlClose = (c.match(/<\/html>/g) || []).length;
console.log('\nbody close count:', bodyClose);
console.log('html close count:', htmlClose);
console.log('Total lines:', c.split('\n').length);
