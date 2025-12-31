import React from 'react'
import './Projects.css'

const Projects = () => {
  const projects = [
    {
      id: 1,
      title: 'BYRYZN',
      description: '휴젤(주)의 바이리즌 제품 페이지 제작. GASP를 이용하여 스크롤 애니메이션을 구현하였습니다.',
      image: 'https://byryzn.co.kr/assets/common/images/thumbnail.png',
      tags: ['HTML5', 'CSS3', 'JavaScript', 'jQuery', 'GSAP'],
      link: 'https://byryzn.co.kr/'
    },
    {
      id: 2,
      title: 'Corporate Website',
      description: '기업 홈페이지 리뉴얼 프로젝트. 웹 접근성과 SEO 최적화를 고려한 개발',
      image: 'https://via.placeholder.com/600x400/8b5cf6/ffffff?text=Corporate',
      tags: ['HTML5', 'CSS3', 'JavaScript', 'Accessibility'],
      link: '#'
    },
    {
      id: 3,
      title: 'Dashboard Application',
      description: '데이터 시각화 대시보드. Vue.js를 활용한 인터랙티브한 UI 구현',
      image: 'https://via.placeholder.com/600x400/10b981/ffffff?text=Dashboard',
      tags: ['Vue.js', 'Chart.js', 'Tailwind CSS', 'REST API'],
      link: '#'
    },
    {
      id: 4,
      title: 'Mobile App Landing',
      description: '모바일 앱 프로모션 랜딩 페이지. 애니메이션과 인터랙션 중심의 디자인',
      image: 'https://via.placeholder.com/600x400/f59e0b/ffffff?text=Landing',
      tags: ['Next.js', 'GSAP', 'Framer Motion', 'Mobile First'],
      link: '#'
    },
    {
      id: 5,
      title: 'Portfolio Website',
      description: '크리에이티브 포트폴리오 웹사이트. 미니멀 디자인과 부드러운 트랜지션',
      image: 'https://via.placeholder.com/600x400/ef4444/ffffff?text=Portfolio',
      tags: ['React', 'Styled Components', 'Responsive', 'Animation'],
      link: '#'
    },
    {
      id: 6,
      title: 'Admin Panel',
      description: '관리자 대시보드 시스템. 복잡한 데이터 관리와 필터링 기능 구현',
      image: 'https://via.placeholder.com/600x400/3b82f6/ffffff?text=Admin',
      tags: ['React', 'Material-UI', 'Redux', 'REST API'],
      link: '#'
    }
  ]

  return (
    <section id="projects" className="projects section">
      <div className="container">
        <h2 className="section-title">Projects</h2>
        <div className="projects-grid">
          {projects.map((project) => (
            <div key={project.id} className="project-card">
              <div className="project-image">
                <img src={project.image} alt={project.title} />
                <div className="project-overlay">
                  <a href={project.link} className="project-link" target="_blank" rel="noopener noreferrer">
                    View Project
                  </a>
                </div>
              </div>
              <div className="project-content">
                <h3 className="project-title">{project.title}</h3>
                <p className="project-description">{project.description}</p>
                <div className="project-tags">
                  {project.tags.map((tag, index) => (
                    <span key={index} className="project-tag">{tag}</span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

export default Projects
