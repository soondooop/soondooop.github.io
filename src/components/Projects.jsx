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
      title: '굿앤굿 어린이케어 APP',
      description: '휴젤(주)의 바이리즌 제품 페이지 제작. GASP를 이용하여 스크롤 애니메이션을 구현하였습니다.',
      image: 'https://www.pitap.at/assets/images/project/projectView8_1.png',
      tags: ['HTML5', 'CSS3', 'JavaScript', 'jQuery', 'GSAP', 'Ajax'],
      link: 'https://apps.apple.com/kr/app/%EA%B5%BF%EC%95%A4%EA%B5%BF-%EC%96%B4%EB%A6%B0%EC%9D%B4%EC%BC%80%EC%96%B4/id1229766852'
    },
    {
      id: 3,
      title: '콜레오 마케팅 그룹',
      description: '콜레오 마케팅 그룹 홈페이지 구축 및 운영',
      image: 'https://www.pitap.at/assets/images/kv/ImageAssets_coleo.jpg',
      tags: ['HTML5', 'CSS3', 'JavaScript', 'jQuery', 'GSAP', 'Ajax'],
      link: 'http://www.coleomarketing.com/'
    },
    {
      id: 4,
      title: '프리미엄 메이필드 호텔',
      description: '메이필드 호텔 홈페이지 구축 및 운영',
      image: 'https://www.mayfield.co.kr/assets/share/share_img_v1.png',
      tags: ['HTML5', 'CSS3', 'JavaScript', 'jQuery', 'GSAP', 'Ajax'],
      link: 'https://www.mayfield.co.kr/main/'
    },
    {
      id: 5,
      title: 'LG에너지솔루션',
      description: 'LG에너지 솔루션 배터리 인사이드 페이지 제작 및 배터리 퀴즈 이벤트 제작.',
      image: 'https://inside.lgensol.com/wp-content/uploads/2025/04/BATTERY-INSIDE_OG-Image1200x630.webp',
      tags: ['HTML5', 'CSS3', 'JavaScript', 'jQuery', 'wordpress'],
      link: 'https://inside.lgensol.com/'
    },
    {
      id: 6,
      title: 'LG화학블로그',
      description: 'LG화학 블로그 페이지 제작 및 운영',
      image: 'https://www.pitap.at/assets/images/kv/ImageAssets_lgblog.jpg',
      tags: ['HTML5', 'CSS3', 'JavaScript', 'jQuery', 'wordpress'],
      link: 'https://blog.lgchem.com/'
    },
    {
      id: 7, 
      title: 'iLab Original',
      description: 'iLab Original - 푸바오와 무뎅이가 전하는 편지 페이지 제작',
      image: 'https://innovationlab.co.kr/project/zootopia/og.jpg',
      tags: ['HTML5', 'CSS3', 'JavaScript', 'jQuery', 'GSAP'],
      link: 'https://innovationlab.co.kr/project/zootopia/'
    },
    {
      id: 8,
      title: '롯데면세점 컨템포러리',
      description: '롯데면세점 컨템포러리 페이지 제작 및 운영',
      image: 'https://static.lottedfs.com/contents/images/event-img/20240221170954853fc540e1bf9b74c6aaed952cec608f534.jpg',
      tags: ['HTML5', 'CSS3', 'JavaScript', 'jQuery'],
      link: 'https://kor.lottedfs.com/kr/event/eventDetail?evtDispNo=1044489'
    },
    {
      id: 9,
      title: '롯데면세점 더모코스메틱',
      description: '롯데면세점 더모코스메틱 페이지 제작 및 운영',
      image: 'https://static.lottedfs.com/contents/images/event-img/20240906161815988159fce0010524ffda929b656c113fbb3.png',
      tags: ['HTML5', 'CSS3', 'JavaScript', 'jQuery'],
      link: 'https://kor.lottedfs.com/kr/event/eventDetail?evtDispNo=1047430'
    },
    {
      id: 10,
      title: '롯데면세점 먼슬리 뷰티',
      description: '롯데면세점 먼슬리 뷰티 페이지 제작 및 운영',
      image: 'https://static.lottedfs.com/contents/images/event-img/2025123110232550782c5508f91864cbfb7c3a00f13eb9b24.webp',
      tags: ['HTML5', 'CSS3', 'JavaScript', 'jQuery'],
      link: 'https://kor.lottedfs.com/kr/event/eventDetail?evtDispNo=1052984'
    },
    {
      id: 11,
      title: '롯데면세점 Shine in winter',
      description: '롯데면세점 Shine in winter 페이지 제작 및 운영',
      image: 'https://static.lottedfs.com/contents/images/event-img/2025111814345124087a9b09e4b7344fab6bd1e6ddb42e8cd.jpg',
      tags: ['HTML5', 'CSS3', 'JavaScript', 'jQuery'],
      link: 'https://kor.lottedfs.com/kr/event/eventDetail?evtDispNo=1052515'
    },
    {
      id: 12,
      title: '롯데면세점 숨은 면세 찾기',
      description: '롯데면세점 숨은 면세 찾기 시리즈 페이지 제작 및 운영',
      image: 'https://static.lottedfs.com/contents/images/event-img/2025020508403084709b9a911d2024e0ba9dae739206fe881.jpg',
      tags: ['HTML5', 'CSS3', 'JavaScript', 'jQuery', 'GSAP'],
      link: 'https://kor.lottedfs.com/kr/event/eventDetail?evtDispNo=1049084'
    },
    {
      id: 13,
      title: '롯데면세점 주류 큐레이션',
      description: '롯데면세점 주류 큐레이션 페이지 제작 및 운영',
      image: 'https://static.lottedfs.com/contents/images/event-img/20250205092750994ab0bffda2e454894a27f4258a3362bd9.jpg',
      tags: ['HTML5', 'CSS3', 'JavaScript', 'jQuery', 'GSAP'],
      link: 'https://kor.lottedfs.com/kr/event/eventDetail?evtDispNo=1049005'
    },
    {
      id: 14, 
      title: '롯데면세점 뷰티 큐레이션',
      description: '롯데면세점 주류 큐레이션 페이지 제작 및 운영',
      image: 'https://static.lottedfs.com/contents/images/event-img/2025020509530994236e24c1fc81e436d8317b1437f891b91.jpg',
      tags: ['HTML5', 'CSS3', 'JavaScript', 'jQuery', 'GSAP'],
      link: 'https://kor.lottedfs.com/kr/event/eventDetail?evtDispNo=1049008'
    },
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
