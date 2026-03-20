export default function handler(req, res) {
  // Clear the session cookie by setting Max-Age=0
  res.setHeader('Set-Cookie',
    '__session=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax; Secure'
  );
  res.redirect('/login.html');
}
