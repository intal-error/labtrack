import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../services/firebase";
import { MdVisibility, MdVisibilityOff } from "react-icons/md";
import toast from "react-hot-toast";
import "../styles/pages/login.css";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      sessionStorage.setItem("slsu_admin_email", email.trim());
      toast.success("Login successful!");
      navigate("/");
    } catch (err) {
      const msg = err.code === "auth/invalid-credential" ? "Invalid email or password" : "Login failed. Please try again.";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <img src="/slsulucena.jpg" alt="" className="login-bg" />
      <div className="login-overlay" />

      <div className="login-content">
        <div className="login-left">
          <div className="login-brand">
            <img src="/logo.png" alt="SLSU Logo" className="login-logo" />
            <span className="login-brand-name">SLSU</span>
          </div>
          <h1 className="login-title">LAB<span className="login-title-bold">TRACK</span></h1>
          <p className="login-subtitle">Digital Tracking System for Tool and Equipment Borrowing</p>
          <p className="login-desc">
            A capstone project of Southern Luzon State University - Lucena Campus,
            digitalizing the manual borrowing process for efficiency and accountability.
          </p>
        </div>

        <div className="login-card">
          <h2 className="login-card-title">Welcome Back</h2>
          <p className="login-card-subtitle">Sign in to your admin account</p>

          <form onSubmit={handleSubmit}>
            <div className="login-field">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="login-field">
              <label htmlFor="password">Password</label>
              <div className="login-password-wrap">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className="login-password-toggle"
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex={-1}
                >
                  {showPassword ? <MdVisibilityOff size={20} /> : <MdVisibility size={20} />}
                </button>
              </div>
            </div>

            <div className="login-extras">
              <label className="login-remember">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                />
                <span>Remember Me</span>
              </label>
              <a href="#" className="login-forgot" onClick={(e) => e.preventDefault()}>Forgot Password?</a>
            </div>

            <button type="submit" className="login-submit" disabled={loading}>
              {loading ? "Logging in..." : "Login"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
