const nodemailer = require('nodemailer');

const sendEmail = async (options) => {
  try {
    // 1. Create a transporter (using Gmail or any SMTP)
    const transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST || "smtp.gmail.com", // fallback for Gmail
      port: process.env.EMAIL_PORT || 587,
      secure: false, // true for 465, false for 587
      auth: {
        user: process.env.EMAIL_USER, // Your email
        pass: process.env.EMAIL_PASS, // Your app password
      },
    });

    // 2. Define email options
    const mailOptions = {
      from: process.env.EMAIL_FROM || `"DevDocs AI" <${process.env.EMAIL_USER}>`,
      to: options.email,       // recipient
      subject: options.subject, // subject line
      html: options.html,       // HTML content
    };

    // 3. Send the email
    const info = await transporter.sendMail(mailOptions);

    console.log(`✅ Email sent to ${options.email}: ${info.messageId}`);
    return info;

  } catch (error) {
    console.error("❌ Email sending failed:", error.message);
    throw new Error("Email could not be sent");
  }
};

module.exports = sendEmail;
