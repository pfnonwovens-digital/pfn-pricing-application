const nodemailer = require('nodemailer');
const polymerIndexes = require('../src/backend/polymer-indexes');

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function getEmailVisualSpacerLines(count = 4) {
  // Trailing truly empty lines can be trimmed by mail systems.
  // NBSP lines render as visually blank separators.
  return Array.from({ length: count }, () => '\u00A0');
}

async function sendReminderEmail(dueRows, dateIso) {
  const host = requiredEnv('SMTP_HOST');
  const port = Number(process.env.SMTP_PORT || 587);
  const user = requiredEnv('SMTP_USER');
  const pass = requiredEnv('SMTP_PASS');
  const from = requiredEnv('REMINDER_FROM_EMAIL');
  const to = requiredEnv('REMINDER_TO_EMAIL');

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass }
  });

  const textBody = [
    `Polymer index reminder for ${dateIso}`,
    '',
    'The following indexes are due for weekly value entry:',
    ...dueRows.map((row, i) => `${i + 1}. ${row.name} | last value date: ${row.latest_value_date || 'none'}`),
    '',
    'Open the app: /polymer-indexes',
    ...getEmailVisualSpacerLines(4)
  ].join('\n');

  await transporter.sendMail({
    from,
    to,
    subject: `Polymer Index Reminder - ${dateIso} (${dueRows.length} due)` ,
    text: textBody
  });
}

async function main() {
  try {
    await polymerIndexes.initializeDatabase();
    const due = await polymerIndexes.getDueReminders(new Date());
    const dueRows = due.dueIndexes || [];

    if (!dueRows.length) {
      console.log(`No due indexes for ${due.date}. No email sent.`);
      process.exit(0);
    }

    await sendReminderEmail(dueRows, due.date);
    console.log(`Reminder email sent for ${dueRows.length} due indexes.`);
    process.exit(0);
  } catch (err) {
    console.error('Reminder job failed:', err.message);
    process.exit(1);
  }
}

main();
