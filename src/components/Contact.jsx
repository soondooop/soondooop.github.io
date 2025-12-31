import React, { useState } from 'react'
import { FaEnvelope, FaPhone, FaGithub, FaInstagram } from 'react-icons/fa'
import './Contact.css'

const Contact = () => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    message: ''
  })

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    })
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    // 폼 제출 로직
    console.log('Form submitted:', formData)
    alert('메시지가 전송되었습니다!')
    setFormData({ name: '', email: '', message: '' })
  }

  return (
    <section id="contact" className="contact section">
      <div className="container">
        <h2 className="section-title">Contact</h2>
        <div className="contact-content">
          <div className="contact-info">
            <h3>연락주시면 빠르게 답변드리겠습니다</h3>
            <p>
              새로운 프로젝트나 협업 기회에 대해 
              언제든지 연락 주세요.
            </p>
            <div className="contact-items">
              <div className="contact-item">
                <div className="contact-icon">
                  <FaEnvelope />
                </div>
                <div>
                  <h4>Email</h4>
                  <a href="mailto:tmdehk02@gmail.com">tmdehk02@gmail.com</a>
                </div>
              </div>
              <div className="contact-item">
                <div className="contact-icon">
                  <FaPhone />
                </div>
                <div>
                  <h4>Phone</h4>
                  <a href="tel:+821059230708">010-5923-0708</a>
                </div>
              </div>
              <div className="contact-item">
                <div className="contact-icon">
                  <FaGithub />
                </div>
                <div>
                  <h4>GitHub</h4>
                  <a href="https://github.com/soondooop" target="_blank" rel="noopener noreferrer">
                    github.com/soondooop
                  </a>
                </div>
              </div>
              <div className="contact-item">
                <div className="contact-icon">
                  <FaInstagram />
                </div>
                <div>
                  <h4>Instagram</h4>
                  <a href="https://www.instagram.com/soondooop/" target="_blank" rel="noopener noreferrer">
                    instagram.com/soondooop/
                  </a>
                </div>
              </div>
            </div>
          </div>
          <form className="contact-form" onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="name">이름</label>
              <input
                type="text"
                id="name"
                name="name"
                value={formData.name}
                onChange={handleChange}
                required
                placeholder="이름을 입력하세요"
              />
            </div>
            <div className="form-group">
              <label htmlFor="email">이메일</label>
              <input
                type="email"
                id="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                required
                placeholder="이메일을 입력하세요"
              />
            </div>
            <div className="form-group">
              <label htmlFor="message">메시지</label>
              <textarea
                id="message"
                name="message"
                value={formData.message}
                onChange={handleChange}
                required
                rows="6"
                placeholder="메시지를 입력하세요"
              ></textarea>
            </div>
            <button type="submit" className="btn btn-primary btn-submit">
              메시지 보내기
            </button>
          </form>
        </div>
      </div>
    </section>
  )
}

export default Contact
