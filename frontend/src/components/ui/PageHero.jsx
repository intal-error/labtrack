import "../../styles/pages/page-hero.css";

export default function PageHero({ icon: Icon, title, subtitle, children }) {
  return (
    <section className="page-hero">
      <span className="hero-glow hero-glow-1" />
      <span className="hero-glow hero-glow-2" />
      <div className="page-hero-content">
        <div className="page-hero-text">
          {Icon && (
            <div className="page-hero-icon">
              <Icon size={24} />
            </div>
          )}
          <div>
            <h1>{title}</h1>
            {subtitle && <p className="page-hero-subtitle">{subtitle}</p>}
          </div>
        </div>
        {children && <div className="page-hero-actions">{children}</div>}
      </div>
    </section>
  );
}
