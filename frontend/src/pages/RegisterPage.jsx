import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../services/firebase";
import { api } from "../services/api";
import { useAuth } from "../context/AuthContext";
import { COURSES } from "../constants/courses";
import { MdSchool, MdPerson, MdVisibility, MdVisibilityOff, MdEmail, MdLock, MdBadge, MdBook, MdCalendarToday, MdAssignment, MdArrowForward, MdCheckCircle } from "react-icons/md";
import toast from "react-hot-toast";
import "../styles/pages/register.css";

const YEARS = ["1st Year", "2nd Year", "3rd Year", "4th Year", "5th Year"];

export default function RegisterPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { role, loading: authLoading } = useAuth();
  const [registered, setRegistered] = useState(false);

  useEffect(() => {
    if (!registered || authLoading || !role) return;
    navigate("/home");
  }, [registered, authLoading, role, navigate]);

  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    confirmPassword: "",
    schoolId: "",
    course: "",
    year: "",
    section: "",
  });

  const update = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (form.password !== form.confirmPassword) {
      return toast.error("Passwords do not match");
    }
    if (form.password.length < 6) {
      return toast.error("Password must be at least 6 characters");
    }
    if (!form.firstName || !form.lastName || !form.email) {
      return toast.error("Please fill in all required fields");
    }
    if (!form.schoolId) {
      return toast.error("School ID is required");
    }

    setLoading(true);
    try {
      await api.register({
        role: "student",
        email: form.email.trim(),
        password: form.password,
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        schoolId: form.schoolId.trim(),
        course: form.course,
        year: form.year,
        section: form.section.trim(),
      });

      await signInWithEmailAndPassword(auth, form.email.trim(), form.password);

      toast.success("Registration successful! Welcome to LabTrack!");
      setRegistered(true);
    } catch (err) {
      let msg = "Registration failed. Please try again.";
      if (err.message?.includes("already registered") || err.message?.includes("email-already-in-use")) {
        msg = "This email is already registered";
      } else if (err.message?.includes("This email is already registered")) {
        msg = "This email is already registered";
      } else if (err.message?.includes("Invalid email")) {
        msg = "Invalid email address";
      } else if (err.message?.includes("Password")) {
        msg = err.message;
      } else if (err.message?.includes("Required fields")) {
        msg = "Please fill in all required fields";
      }
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="register-page">
      <img src="/slsulucena.jpg" alt="" className="register-bg" />
      <div className="register-overlay" />

      <div className="register-content">
        <div className="register-left">
          <div className="register-brand">
            <img src="/logo.png" alt="SLSU Logo" className="register-logo" />
            <span className="register-brand-name">SLSU</span>
          </div>
          <h1 className="register-title">LAB<span className="register-title-bold">TRACK</span></h1>
          <p className="register-subtitle">Create Your Account</p>
          <p className="register-desc">
            Join the digital tracking system for laboratory equipment borrowing.
            Register as a student to get started.
          </p>
        </div>

        <div className="register-card">
          <div className="register-card-header">
            <div className="register-badge">
              <MdSchool size={16} />
              <span>Student Registration</span>
            </div>
            <h2 className="register-card-title">Create Account</h2>
            <p className="register-card-subtitle">Fill in your details to get started</p>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="register-section">
              <div className="register-section-header">
                <div className="register-section-icon personal"><MdPerson size={14} /></div>
                <span className="register-section-title">Personal Info</span>
              </div>
              <div className="register-row">
                <div className="register-field">
                  <label>First Name <span className="register-required" /></label>
                  <div className="register-input-wrap">
                    <input
                      type="text"
                      placeholder="First name"
                      value={form.firstName}
                      onChange={(e) => update("firstName", e.target.value)}
                      required
                    />
                    <MdPerson size={16} className="register-input-icon" />
                  </div>
                </div>
                <div className="register-field">
                  <label>Last Name <span className="register-required" /></label>
                  <div className="register-input-wrap">
                    <input
                      type="text"
                      placeholder="Last name"
                      value={form.lastName}
                      onChange={(e) => update("lastName", e.target.value)}
                      required
                    />
                    <MdPerson size={16} className="register-input-icon" />
                  </div>
                </div>
              </div>
            </div>

            <div className="register-section">
              <div className="register-section-header">
                <div className="register-section-icon academic"><MdBook size={14} /></div>
                <span className="register-section-title">Academic Details</span>
              </div>
              <div className="register-field">
                <label>School ID <span className="register-required" /></label>
                <div className="register-input-wrap">
                  <input
                    type="text"
                    placeholder="e.g. 24D-00001"
                    value={form.schoolId}
                    onChange={(e) => update("schoolId", e.target.value)}
                    required
                  />
                  <MdBadge size={16} className="register-input-icon" />
                </div>
              </div>
              <div className="register-row register-row-3">
                <div className="register-field">
                  <label>Course</label>
                  <div className="register-input-wrap">
                    <select value={form.course} onChange={(e) => update("course", e.target.value)}>
                      <option value="">Select course</option>
                      {COURSES.map((c) => <option key={c}>{c}</option>)}
                    </select>
                    <MdBook size={16} className="register-input-icon" />
                  </div>
                </div>
                <div className="register-field">
                  <label>Year</label>
                  <div className="register-input-wrap">
                    <select value={form.year} onChange={(e) => update("year", e.target.value)}>
                      <option value="">Select year</option>
                      {YEARS.map((y) => <option key={y}>{y}</option>)}
                    </select>
                    <MdCalendarToday size={16} className="register-input-icon" />
                  </div>
                </div>
                <div className="register-field">
                  <label>Section</label>
                  <div className="register-input-wrap">
                    <input
                      type="text"
                      placeholder="e.g. A, 3B"
                      value={form.section}
                      onChange={(e) => update("section", e.target.value)}
                    />
                    <MdAssignment size={16} className="register-input-icon" />
                  </div>
                </div>
              </div>
            </div>

            <div className="register-section">
              <div className="register-section-header">
                <div className="register-section-icon security"><MdLock size={14} /></div>
                <span className="register-section-title">Account Security</span>
              </div>
              <div className="register-field">
                <label>Email <span className="register-required" /></label>
                <div className="register-input-wrap">
                  <input
                    type="email"
                    placeholder="your.email@slsu.edu.ph"
                    value={form.email}
                    onChange={(e) => update("email", e.target.value)}
                    required
                  />
                  <MdEmail size={16} className="register-input-icon" />
                </div>
              </div>
              <div className="register-row">
                <div className="register-field">
                  <label>Password <span className="register-required" /></label>
                  <div className="register-input-wrap">
                    <input
                      type={showPassword ? "text" : "password"}
                      placeholder="Min. 6 characters"
                      value={form.password}
                      onChange={(e) => update("password", e.target.value)}
                      required
                    />
                    <button type="button" className="register-password-toggle" onClick={() => setShowPassword(!showPassword)} tabIndex={-1}>
                      {showPassword ? <MdVisibilityOff size={18} /> : <MdVisibility size={18} />}
                    </button>
                  </div>
                </div>
                <div className="register-field">
                  <label>Confirm Password <span className="register-required" /></label>
                  <div className="register-input-wrap">
                    <input
                      type={showConfirm ? "text" : "password"}
                      placeholder="Repeat password"
                      value={form.confirmPassword}
                      onChange={(e) => update("confirmPassword", e.target.value)}
                      required
                    />
                    <button type="button" className="register-password-toggle" onClick={() => setShowConfirm(!showConfirm)} tabIndex={-1}>
                      {showConfirm ? <MdVisibilityOff size={18} /> : <MdVisibility size={18} />}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <button type="submit" className="register-submit" disabled={loading}>
              {loading ? (
                <span className="register-submit-loading">Creating Account...</span>
              ) : (
                <>
                  Create Account
                  <MdArrowForward size={18} />
                </>
              )}
            </button>
          </form>

          <p className="register-login-link">
            Already have an account? <Link to="/login">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
