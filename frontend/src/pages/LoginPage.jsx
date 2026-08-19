import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { signInWithEmailAndPassword, sendPasswordResetEmail, signOut } from "firebase/auth";
import { auth } from "../services/firebase";
import { useAuth } from "../context/AuthContext";
import { MdSchool, MdPerson, MdAdminPanelSettings, MdVisibility, MdVisibilityOff } from "react-icons/md";
import toast from "react-hot-toast";
import "../styles/pages/login.css";

const ROLES = [
  { key: "student", label: "Student", icon: MdSchool, desc: "Access lab equipment" },
  { key: "faculty", label: "Faculty", icon: MdPerson, desc: "Manage records & grades" },
  { key: "admin", label: "Admin", icon: MdAdminPanelSettings, desc: "System administration" },
];

export default function LoginPage() {
  const [selectedRole, setSelectedRole] = useState("student");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { role, loading: authLoading } = useAuth();
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    const savedEmail = localStorage.getItem("slsu_remembered_email");
    if (savedEmail) {
      setEmail(savedEmail);
      setRememberMe(true);
    }
  }, []);

  useEffect(() => {
    if (!signedIn || authLoading || !role) return;
    if (role !== selectedRole) {
      toast.error(`This account is registered as ${role}. Please select the correct role.`);
      signOut(auth);
      setSignedIn(false);
      return;
    }
    toast.success("Welcome back!");
    if (role === "student") {
      navigate("/scanner");
    } else {
      navigate("/overview");
    }
  }, [signedIn, authLoading, role, selectedRole, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      if (rememberMe) {
        localStorage.setItem("slsu_remembered_email", email.trim());
        sessionStorage.removeItem("slsu_user_email");
      } else {
        sessionStorage.setItem("slsu_user_email", email.trim());
        localStorage.removeItem("slsu_remembered_email");
      }
      setSignedIn(true);
    } catch (err) {
      let msg = "Login failed. Please try again.";
      if (err.code === "auth/invalid-credential") msg = "Invalid email or password";
      else if (err.code === "auth/user-not-found") msg = "No account found with this email";
      else if (err.code === "auth/wrong-password") msg = "Incorrect password";
      else if (err.code === "auth/too-many-requests") msg = "Too many attempts. Please try again later.";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    if (!email.trim()) {
      toast.error("Please enter your email address first");
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email.trim());
      toast.success("Password reset email sent! Check your inbox.");
    } catch (err) {
      if (err.code === "auth/user-not-found") {
        toast.error("No account found with this email");
      } else {
        toast.error("Failed to send reset email. Please try again.");
      }
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
          <p className="login-card-subtitle">Sign in to your account</p>

          <div className="login-role-selector">
            {ROLES.map(({ key, label, icon: Icon, desc }) => (
              <div
                key={key}
                className={`login-role-card ${selectedRole === key ? "active" : ""}`}
                onClick={() => setSelectedRole(key)}
              >
                <div className="role-icon"><Icon size={28} /></div>
                <div className="role-label">{label}</div>
                <div className="role-desc">{desc}</div>
              </div>
            ))}
          </div>

          <form onSubmit={handleSubmit}>
            <div className="login-field">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                placeholder={`Enter your ${selectedRole} email`}
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
              <a href="#" className="login-forgot" onClick={handleForgotPassword}>Forgot Password?</a>
            </div>

            <button type="submit" className="login-submit" disabled={loading}>
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>

          {selectedRole !== "admin" && (
            <p className="login-register-link">
              Don&apos;t have an account? <Link to="/register">Register here</Link>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
