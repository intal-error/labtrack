import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../../services/firebase";
import { api } from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import { COURSES } from "../../constants/courses";
import { MdSchool, MdPerson, MdVisibility, MdVisibilityOff, MdEmail, MdLock, MdBadge, MdBook, MdCalendarToday, MdAssignment, MdArrowForward, MdClose, MdCheckCircle } from "react-icons/md";
import toast from "react-hot-toast";

const YEARS = ["1st Year", "2nd Year", "3rd Year", "4th Year"];

export default function SignUpForm({ onSwitchToSignIn }) {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { role, loading: authLoading } = useAuth();
  const [registered, setRegistered] = useState(false);

  useEffect(() => {
    if (!registered || authLoading || !role) return;
    navigate("/dashboard");
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

  const passwordRequirements = {
    minLength: form.password.length >= 8,
    hasUppercase: /[A-Z]/.test(form.password),
    hasLowercase: /[a-z]/.test(form.password),
    hasNumber: /[0-9]/.test(form.password),
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (form.password !== form.confirmPassword) {
      return toast.error("Passwords do not match");
    }
    if (form.password.length < 8) {
      return toast.error("Password must be at least 8 characters");
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
    <>
      <div className="auth-card-head">
        <div className="auth-badge">
          <MdSchool size={14} />
          <span>Student Registration</span>
        </div>
        <h2 className="auth-card-title">Create your account</h2>
      </div>

      <form className="auth-form" onSubmit={handleSubmit}>
        <div className="auth-section">
          <div className="auth-section-header">
            <span className="auth-section-label">Personal Info</span>
          </div>
          <div className="auth-row">
            <div className="auth-field">
              <label className="auth-label">First Name <span className="auth-required" /></label>
              <div className="auth-input-wrap has-left">
                <input
                  className="auth-input"
                  type="text"
                  placeholder="Juan"
                  value={form.firstName}
                  onChange={(e) => update("firstName", e.target.value)}
                  required
                />
                <span className="auth-input-icon"><MdPerson size={17} /></span>
              </div>
            </div>
            <div className="auth-field">
              <label className="auth-label">Last Name <span className="auth-required" /></label>
              <div className="auth-input-wrap has-left">
                <input
                  className="auth-input"
                  type="text"
                  placeholder="Dela Cruz"
                  value={form.lastName}
                  onChange={(e) => update("lastName", e.target.value)}
                  required
                />
                <span className="auth-input-icon"><MdPerson size={17} /></span>
              </div>
            </div>
          </div>
        </div>

        <div className="auth-section">
          <div className="auth-section-header">
            <span className="auth-section-label">Academic Details</span>
          </div>
          <div className="auth-field">
            <label className="auth-label">School ID <span className="auth-required" /></label>
            <div className="auth-input-wrap has-left">
              <input
                className="auth-input"
                type="text"
                placeholder="e.g. 24D-00001"
                value={form.schoolId}
                onChange={(e) => update("schoolId", e.target.value)}
                required
              />
              <span className="auth-input-icon"><MdBadge size={17} /></span>
            </div>
          </div>
          <div className="auth-row auth-row-3">
            <div className="auth-field">
              <label className="auth-label">Course</label>
              <div className="auth-input-wrap has-left">
                <select className="auth-input" value={form.course} onChange={(e) => update("course", e.target.value)}>
                  <option value="">Course</option>
                  {COURSES.map((c) => <option key={c}>{c}</option>)}
                </select>
                <span className="auth-input-icon"><MdBook size={17} /></span>
              </div>
            </div>
            <div className="auth-field">
              <label className="auth-label">Year</label>
              <div className="auth-input-wrap has-left">
                <select className="auth-input" value={form.year} onChange={(e) => update("year", e.target.value)}>
                  <option value="">Year</option>
                  {YEARS.map((y) => <option key={y}>{y}</option>)}
                </select>
                <span className="auth-input-icon"><MdCalendarToday size={17} /></span>
              </div>
            </div>
            <div className="auth-field">
              <label className="auth-label">Section</label>
              <div className="auth-input-wrap has-left">
                <input
                  className="auth-input"
                  type="text"
                  placeholder="e.g. A, 3B"
                  value={form.section}
                  onChange={(e) => update("section", e.target.value)}
                />
                <span className="auth-input-icon"><MdAssignment size={17} /></span>
              </div>
            </div>
          </div>
        </div>

        <div className="auth-section">
          <div className="auth-section-header">
            <span className="auth-section-label">Account Security</span>
          </div>
          <div className="auth-field">
            <label className="auth-label">Email <span className="auth-required" /></label>
            <div className="auth-input-wrap has-left">
              <input
                className="auth-input"
                type="email"
                placeholder="your.email@slsu.edu.ph"
                value={form.email}
                onChange={(e) => update("email", e.target.value)}
                required
              />
              <span className="auth-input-icon"><MdEmail size={17} /></span>
            </div>
          </div>
          <div className="auth-row">
            <div className="auth-field">
              <label className="auth-label">Password <span className="auth-required" /></label>
              <div className="auth-input-wrap has-left has-toggle">
                <input
                  className="auth-input"
                  type={showPassword ? "text" : "password"}
                  placeholder="Min. 8 characters"
                  value={form.password}
                  onChange={(e) => update("password", e.target.value)}
                  required
                />
                <span className="auth-input-icon"><MdLock size={17} /></span>
                <button type="button" className="auth-password-toggle" onClick={() => setShowPassword(!showPassword)} tabIndex={-1}>
                  {showPassword ? <MdVisibilityOff size={18} /> : <MdVisibility size={18} />}
                </button>
              </div>
              {form.password.length > 0 && (
                <div className="auth-reqs">
                  <div className={`auth-req ${passwordRequirements.minLength ? "met" : "unmet"}`}>
                    {passwordRequirements.minLength ? <MdCheckCircle size={14} /> : <MdClose size={14} />}
                    <span>Minimum 8 characters</span>
                  </div>
                  <div className={`auth-req ${passwordRequirements.hasUppercase ? "met" : "unmet"}`}>
                    {passwordRequirements.hasUppercase ? <MdCheckCircle size={14} /> : <MdClose size={14} />}
                    <span>At least one uppercase letter</span>
                  </div>
                  <div className={`auth-req ${passwordRequirements.hasLowercase ? "met" : "unmet"}`}>
                    {passwordRequirements.hasLowercase ? <MdCheckCircle size={14} /> : <MdClose size={14} />}
                    <span>At least one lowercase letter</span>
                  </div>
                  <div className={`auth-req ${passwordRequirements.hasNumber ? "met" : "unmet"}`}>
                    {passwordRequirements.hasNumber ? <MdCheckCircle size={14} /> : <MdClose size={14} />}
                    <span>At least one number</span>
                  </div>
                </div>
              )}
            </div>
            <div className="auth-field">
              <label className="auth-label">Confirm Password <span className="auth-required" /></label>
              <div className="auth-input-wrap has-left has-toggle">
                <input
                  className="auth-input"
                  type={showConfirm ? "text" : "password"}
                  placeholder="Repeat password"
                  value={form.confirmPassword}
                  onChange={(e) => update("confirmPassword", e.target.value)}
                  required
                />
                <span className="auth-input-icon"><MdLock size={17} /></span>
                <button type="button" className="auth-password-toggle" onClick={() => setShowConfirm(!showConfirm)} tabIndex={-1}>
                  {showConfirm ? <MdVisibilityOff size={18} /> : <MdVisibility size={18} />}
                </button>
              </div>
            </div>
          </div>
        </div>

        <button type="submit" className="auth-submit" disabled={loading}>
          {loading ? (
            <span className="auth-spinner" aria-hidden="true" />
          ) : null}
          {loading ? "Creating account..." : (
            <>
              Create account
              <MdArrowForward size={17} />
            </>
          )}
        </button>
      </form>

      <p className="auth-footer">
        Already have an account?{" "}
        <button type="button" className="auth-link" onClick={onSwitchToSignIn}>Sign in</button>
      </p>
    </>
  );
}
