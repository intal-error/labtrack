import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../services/firebase";
import { useTheme } from "../context/ThemeContext";
import toast from "react-hot-toast";
import "../styles/pages/login.css";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { dark, toggleTheme } = useTheme();

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
    <div className="login-container">
      <div className="login-left">
        <div className="login-overlay">
          <img src="/slsulucena.jpg" alt="SLSU Background" className="login-bg-img" />
        </div>
        <div className="login-left-content">
          <img src="/logo.png" alt="SLSU Logo" className="login-logo" />
          <h1 className="login-system-title">SLSU LABTRACK</h1>
        </div>
      </div>

      <div className="login-right">
        <button className="theme-toggle" onClick={toggleTheme}>
          {dark ? "☀️ Light" : "🌙 Dark"}
        </button>
        <div className="login-box">
          <h2>Admin Login</h2>
          <form onSubmit={handleSubmit}>
            <div className="input-group">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                placeholder="Enter admin email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="input-group">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                placeholder="Enter password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <button type="submit" className="login-btn" disabled={loading}>
              {loading ? "Logging in..." : "Login"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
