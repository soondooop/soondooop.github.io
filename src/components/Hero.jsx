import React from 'react'
import './Hero.css'

const Hero = () => {
  return (
    <section id="hero" className="hero">
      <div className="container">
        <div className="hero-content">
          <div className="hero-text">
            <h1 className="hero-title">
              안녕하세요, <br />
              <span className="gradient-text">웹퍼블리셔 김승도</span>입니다
            </h1>
            <p className="hero-description">
                2017년 부터&nbsp;
              {(() => {
                const startYear = 2017;
                const currentYear = new Date().getFullYear();
                const years = currentYear - startYear + 1;
                return (
                  <span style={{ fontWeight: 'bold', color: 'var(--primary-color)' }}>
                    {years}년차&nbsp;
                  </span>
                );
              })()}
              웹퍼블리셔로 활동하고 있습니다.
              <br />
              다년간의 경험을 기반으로 요구사항의 맞추어 <br />
              안정적인 웹사이트를 제작하는 것을 중요하게 생각합니다.
            </p>
            <div className="hero-buttons">
              <a href="#projects" className="btn btn-primary">
                프로젝트 보기
              </a>
              <a href="#contact" className="btn btn-outline">
                연락하기
              </a>
            </div>
          </div>
          <div className="hero-image">
            
            <div className="hero-shape"></div>
          </div>
        </div>
      </div>
    </section>
  )
}

export default Hero
