import React from 'react'
import './Footer.css'

const Footer = () => {
  const currentYear = new Date().getFullYear()

  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-content">
          <div className="footer-text">
            <h3>Portfolio</h3>
            <p>웹퍼블리셔 김승도입니다.</p>
          </div>
          <div className="footer-links">
            <a href="#about">About Me</a>
            <a href="#skills">Skills</a>
            <a href="#projects">Projects</a>
            <a href="#contact">Contact</a>
          </div>
        </div>
        <div className="footer-bottom">
          <p>&copy; {currentYear} Portfolio. All rights reserved.</p>
        </div>
      </div>
    </footer>
  )
}

export default Footer
