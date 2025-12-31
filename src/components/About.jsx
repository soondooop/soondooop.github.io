import React from 'react'
import './About.css'

const About = () => {
  return (
    <section id="about" className="about section">
      <div className="container">
        <h2 className="section-title">About Me</h2>
        <div className="about-content">
          <div className="about-text">
            <h3>
            {(() => {
                const startYear = 2017;
                const currentYear = new Date().getFullYear();
                const years = currentYear - startYear + 1;
                return (
                  <span style={{ fontWeight: 'bold', color: 'var(--primary-color)' }}>
                    {years}년&nbsp;
                  </span>
                );
              })()}
              간의 다양한 업무경험</h3>
            <p>
              웹에이전시에서 다양한 프로젝트를 통해 웹 표준과 반응형 웹 페이지 및 모션 제작을 전문으로 다뤄왔으며, 롯데면세점 이벤트 페이지 운영을 통한 다양한 경험을 하였습니다. 사용자 경험을 최우선으로 생각하며, 깔끔하고 직관적인 인터페이스를 구현하는 것을 추구합니다.
            </p>
            <p>
              최신 웹 기술 트렌드를 지속적으로 학습하고 있으며, React, Vue.js 등의 프레임워크를 활용한 프론트엔드 공부도 함께 진행하고 있습니다.
            </p>
            <div className="about-stats">
              <div className="stat-item">
                <h4>{(() => {
                const startYear = 2017;
                const currentYear = new Date().getFullYear();
                const years = currentYear - startYear + 1;
                return (
                  <span style={{ fontWeight: 'bold', color: 'var(--primary-color)' }}>
                    {years}&nbsp;
                  </span>
                );
              })()}</h4>
                <p>년 경력</p>
              </div>
              <div className="stat-item">
                <h4>99+</h4>
                <p>완료 프로젝트</p>
              </div>
              <div className="stat-item">
                <h4>50+</h4>
                <p>만족한 클라이언트</p>
              </div>
            </div>
          </div>
          <div className="about-image">
            <div className="about-card">
              <div className="card-icon">💼</div>
              <h4>경험</h4>
              <p>다양한 산업 분야의 프로젝트 경험</p>
            </div>
            <div className="about-card">
              <div className="card-icon">🎨</div>
              <h4>디자인</h4>
              <p>1px도 중요하게 생각하는 디자인 맞춤형 코딩</p>
            </div>
            <div className="about-card">
              <div className="card-icon">⚡</div>
              <h4>성능</h4>
              <p>최적화된 코드와 빠른 로딩 속도를 중요시 생각하는 코딩</p>
            </div>
            <div className="about-card">
              <div className="card-icon">📱</div>
              <h4>반응형</h4>
              <p>모든 기기에서 완벽한 경험을 선사할 수 있는 반응형 코딩</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

export default About
