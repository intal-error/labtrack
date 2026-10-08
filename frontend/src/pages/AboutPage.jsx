import "../styles/pages/about.css";

export default function AboutPage() {
  return (
    <section className="about-page">
      <div className="about-split">
        <div className="about-left">
          <div className="overlay-image">
            <img src="/Lucena.bg.webp" alt="SLSU Background" className="bg-img" loading="lazy" width="1280" height="720" decoding="async" />
          </div>
          <div className="about-left-content">
            <img src="/icons/icon-192x192.png" alt="SLSU Logo" className="about-logo" loading="lazy" width="80" height="80" decoding="async" />
            <h1 className="system-title">SLSU LABTRACK</h1>
          </div>
        </div>
        <div className="about-right">
          <div className="about-text">
            <h2>ABOUT THIS SYSTEM</h2>
            <p>
              The <strong>SLSU LabTrack: Web-Based Laboratory Management and Digital Tracking System</strong> is a capstone project
              developed by students of <strong>Southern Luzon State University &ndash; Lucena Campus</strong>. The system aims to modernize
              laboratory operations by providing a centralized platform for inventory management, maintenance scheduling, incident
              reporting, laboratory manual access, report generation, and digital tracking of tool and equipment borrowing and returning
              through QR code technology. It also features a QR Code-based Log Attendance System, allowing students to conveniently record
              their laboratory attendance and activity logs while ensuring accurate and real-time monitoring of laboratory usage. The system
              is designed to improve efficiency, accuracy, accountability, and transparency in managing laboratory resources and activities.
            </p>
            <p>
              Aligned with <strong>SDG 4 &ndash; Quality Education</strong> and <strong>SDG 9 &ndash; Industry, Innovation and Infrastructure</strong>,
              the system supports a more organized, accessible, and technology-driven learning environment for students, faculty, and
              administrators while promoting responsible resource management and institutional innovation.
            </p>
            <p>
              <strong>Developed by:</strong><br />
              Marc Lawrence H. Intal and Nasher De vera
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
