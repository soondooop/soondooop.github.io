import React from 'react'
import { FaHtml5, FaCss3Alt, FaJs, FaReact, FaSass } from 'react-icons/fa'
import { SiJquery, SiVuedotjs, SiNextdotjs, SiTailwindcss, SiFigma, SiAdobephotoshop, SiAdobeillustrator , SiAdobexd, SiGithub  } from 'react-icons/si'
import './Skills.css'

const Skills = () => {
  const skillCategories = [
    {
      title: 'Frontend',
      skills: [
        { name: 'HTML5', icon: <FaHtml5 />, level: 99 },
        { name: 'JavaScript', icon: <FaJs />, level: 95 },
        { name: 'jQuery', icon: <SiJquery />, level: 99 },
        { name: 'React', icon: <FaReact />, level: 10 },
        { name: 'Vue.js', icon: <SiVuedotjs />, level: 10 },
        { name: 'Next.js', icon: <SiNextdotjs />, level: 5 },
      ]
    },
    {
      title: 'Styling',
      skills: [
        { name: 'CSS3', icon: <FaCss3Alt />, level: 99 },
        { name: 'SASS/SCSS', icon: <FaSass />, level: 30 },
        { name: 'Tailwind CSS', icon: <SiTailwindcss />, level: 30 },
        { name: 'CSS Modules', icon: <FaCss3Alt />, level: 30 },
        { name: 'Styled Components', icon: <FaCss3Alt />, level: 30 },
      ]
    },
    {
      title: 'Design & Tools',
      skills: [
        { name: 'Figma', icon: <SiFigma />, level: 90 },
        { name: 'Adobe XD', icon: <SiAdobexd />, level: 90 },
        { name: 'Photoshop', icon: <SiAdobephotoshop />, level: 90 },
        { name: 'Illustrator', icon: <SiAdobeillustrator />, level: 80 },
        { name: 'Github', icon: <SiGithub />, level: 85 },
      ]
    }
  ]

  return (
    <section id="skills" className="skills section">
      <div className="container">
        <h2 className="section-title">Skills</h2>
        <div className="skills-content">
          {skillCategories.map((category, index) => (
            <div key={index} className="skill-category">
              <h3 className="category-title">{category.title}</h3>
              <div className="skill-list">
                {category.skills.map((skill, skillIndex) => (
                  <div key={skillIndex} className="skill-item">
                    <div className="skill-header">
                      <div className="skill-icon">{skill.icon}</div>
                      <span className="skill-name">{skill.name}</span>
                      <span className="skill-percentage">{skill.level}%</span>
                    </div>
                    <div className="skill-bar">
                      <div 
                        className="skill-progress" 
                        style={{ width: `${skill.level}%` }}
                      ></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

export default Skills
