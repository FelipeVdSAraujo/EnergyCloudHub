// server/utils/emailTemplates.js
function verificationEmail({ username, token }) {
    const { FRONTEND_URL } = process.env;
    const base = (FRONTEND_URL || "http://localhost:3000").replace(/\/$/, "");
    const link = `${base}/verify-email?token=${encodeURIComponent(token)}`;
  
    return {
      subject: "Verify your EnSolveCloud Email",
      text: `Hi ${username},\n\nVerify your email using this link:\n${link}\n\nThis link expires in 24 hours.`,
      html: `
        <p>Hi <b>${username}</b>,</p>
        <p>Please verify your email by clicking the link below (expires in 24 hours):</p>
        <p><a href="${link}">${link}</a></p>
      `,
    };
  }
  
  function approvalEmail({ username }) {
    const { FRONTEND_URL } = process.env;
    const base = (FRONTEND_URL || "http://localhost:3000").replace(/\/$/, "");
    const loginLink = `${base}/login`;
  
    return {
      subject: "Your EnSolveCloud Account Has Been Approved",
      text: `Hi ${username},\n\nYour account has been approved. You can now log in:\n${loginLink}`,
      html: `
        <p>Hi <b>${username}</b>,</p>
        <p>Your account has been <b>approved</b>. You can now log in:</p>
        <p><a href="${loginLink}">${loginLink}</a></p>
      `,
    };
  }
  
  function rejectionEmail({ username, reason }) {
    const support = "Contact support if you believe this is a mistake.";
  
    return {
      subject: "Your EnSolveCloud Account Request",
      text: `Hi ${username},\n\nYour account request was rejected.\n${
        reason ? `Reason: ${reason}\n` : ""
      }\n${support}`,
      html: `
        <p>Hi <b>${username}</b>,</p>
        <p>Your account request was <b>rejected</b>.</p>
        ${reason ? `<p><b>Reason:</b> ${reason}</p>` : ""}
        <p>${support}</p>
      `,
    };
  }
  
  export default { verificationEmail, approvalEmail, rejectionEmail };
  