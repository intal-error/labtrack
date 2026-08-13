const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: Number(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const sendOverdueEmail = async (toName, toEmail, itemName, dueDate) => {
  const mailOptions = {
    from: process.env.EMAIL_FROM || "noreply@slsu-labtrack.com",
    to: toEmail,
    subject: `Overdue Return Reminder - ${itemName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto;">
        <h2 style="color: #2e7d32;">SLSU LabTrack - Overdue Return Reminder</h2>
        <p>Dear <strong>${toName}</strong>,</p>
        <p>This is a friendly reminder that the following item is overdue:</p>
        <div style="background: #f5f5f5; padding: 15px; border-radius: 8px; margin: 15px 0;">
          <p><strong>Item:</strong> ${itemName}</p>
          <p><strong>Due Date:</strong> ${dueDate}</p>
        </div>
        <p>Please return the item as soon as possible to avoid any penalties.</p>
        <p>Thank you,<br><strong>SLSU LabTrack System</strong></p>
      </div>
    `,
  };

  await transporter.sendMail(mailOptions);
};

module.exports = { sendOverdueEmail };
