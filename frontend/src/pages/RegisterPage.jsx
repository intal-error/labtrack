import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../services/firebase";
import { api } from "../services/api";
import { useAuth } from "../context/AuthContext";
import { COURSES } from "../constants/courses";
import { MdSchool, MdPerson, MdVisibility, MdVisibilityOff } from "react-icons/md";
import toast from "react-hot-toast";
import "../styles/pages/register.css";

const YEARS = ["1st Year", "2nd Year", "3rd Year", "4th Year", "5th Year"];

export default function RegisterPage() {
  const [activeTab, setActiveTab] = useState("student");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { role, loading: authLoading } = useAuth();
  const [registered, setRegistered] = useState(false);

  useEffect(() => {
    if (!registered || authLoading || !role) return;
    if (role === "student") {
      navigate("/scanner");
    } else {
      navigate("/overview");
    }
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
    employeeId: "",
    department: "",
    position: "",
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
    if (activeTab === "student" && !form.schoolId) {
      return toast.error("School ID is required");
    }
    if (activeTab === "faculty" && !form.employeeId) {
      return toast.error("Employee ID is required");
    }

    setLoading(true);
    try {
      // Register via backend (creates Auth user + Firestore doc + custom claims)
      await api.register({
        role: activeTab,
        email: form.email.trim(),
        password: form.password,
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        ...(activeTab === "student" ? {
          schoolId: form.schoolId.trim(),
          course: form.course,
          year: form.year,
        } : {
          employeeId: form.employeeId.trim(),
          department: form.department.trim(),
          position: form.position.trim(),
        }),
      });

      // Auto-login
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
            Register as a student or faculty member to get started.
          </p>
        </div>

        <div className="register-card">
          <h2 className="register-card-title">Create Account</h2>
          <p className="register-card-subtitle">Choose your role and fill in your details</p>

          <div className="register-tab-selector">
            <button
              className={`register-tab ${activeTab === "student" ? "active" : ""}`}
              onClick={() => setActiveTab("student")}
            >
              <MdSchool size={18} />
              <span>Student</span>
            </button>
            <button
              className={`register-tab ${activeTab === "faculty" ? "active" : ""}`}
              onClick={() => setActiveTab("faculty")}
            >
              <MdPerson size={18} />
              <span>Faculty</span>
            </button>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="register-row">
              <div className="register-field">
                <label>First Name *</label>
                <input
                  type="text"
                  placeholder="First name"
                  value={form.firstName}
                  onChange={(e) => update("firstName", e.target.value)}
                  required
                />
              </div>
              <div className="register-field">
                <label>Last Name *</label>
                <input
                  type="text"
                  placeholder="Last name"
                  value={form.lastName}
                  onChange={(e) => update("lastName", e.target.value)}
                  required
                />
              </div>
            </div>

            {activeTab === "student" ? (
              <>
                <div className="register-field">
                  <label>School ID *</label>
                  <input
                    type="text"
                    placeholder="e.g. 2023-00001"
                    value={form.schoolId}
                    onChange={(e) => update("schoolId", e.target.value)}
                    required
                  />
                </div>
                <div className="register-row">
                  <div className="register-field">
                    <label>Course</label>
                    <select value={form.course} onChange={(e) => update("course", e.target.value)}>
                      <option value="">Select course</option>
                      {COURSES.map((c) => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="register-field">
                    <label>Year</label>
                    <select value={form.year} onChange={(e) => update("year", e.target.value)}>
                      <option value="">Select year</option>
                      {YEARS.map((y) => <option key={y}>{y}</option>)}
                    </select>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="register-field">
                  <label>Employee ID *</label>
                  <input
                    type="text"
                    placeholder="e.g. EMP-2024-001"
                    value={form.employeeId}
                    onChange={(e) => update("employeeId", e.target.value)}
                    required
                  />
                </div>
                <div className="register-row">
                  <div className="register-field">
                    <label>Department</label>
                    <input
                      type="text"
                      placeholder="e.g. IT Department"
                      value={form.department}
                      onChange={(e) => update("department", e.target.value)}
                    />
                  </div>
                  <div className="register-field">
                    <label>Position</label>
                    <input
                      type="text"
                      placeholder="e.g. Laboratory Instructor"
                      value={form.position}
                      onChange={(e) => update("position", e.target.value)}
                    />
                  </div>
                </div>
              </>
            )}

            <div className="register-field">
              <label>Email *</label>
              <input
                type="email"
                placeholder="your.email@slsu.edu.ph"
                value={form.email}
                onChange={(e) => update("email", e.target.value)}
                required
              />
            </div>

            <div className="register-row">
              <div className="register-field">
                <label>Password *</label>
                <div className="register-password-wrap">
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
                <label>Confirm Password *</label>
                <div className="register-password-wrap">
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

            <button type="submit" className="register-submit" disabled={loading}>
              {loading ? "Creating Account..." : "Create Account"}
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
