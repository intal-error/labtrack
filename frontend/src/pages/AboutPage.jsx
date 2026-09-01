import "../styles/pages/about.css";

export default function AboutPage() {
  return (
    <section className="about-page">
      <div className="about-split">
        <div className="about-left">
          <div className="overlay-image">
            <img src="/slsulucena.jpg" alt="SLSU Background" className="bg-img" loading="lazy" width="1920" height="1080" decoding="async" />
          </div>
          <div className="about-left-content">
            <img src="/logo.png" alt="SLSU Logo" className="about-logo" loading="lazy" width="80" height="80" decoding="async" />
            <h1 className="system-title">SLSU LABTRACK</h1>
          </div>
        </div>
        <div className="about-right">
          <div className="about-text">
            <h2>ABOUT THIS SYSTEM</h2>
            <p>
              The <strong>Digital Tracking System for Tool and Equipment Borrowing</strong> is a capstone project of
              <strong> Southern Luzon State University - Lucena Campus</strong> students.
              It aims to digitalize the manual borrowing process to promote efficiency, accountability,
              and sustainable management of laboratory resources.
            </p>
            <p>
              Aligned with <strong>SDG 4</strong> (Quality Education) and <strong>SDG 9</strong> (Industry, Innovation and Infrastructure),
              this system helps foster a more organized and innovative learning environment for both students and faculty.
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
