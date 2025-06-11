import React, { useEffect, useState, useRef } from 'react';
import styled from '@emotion/styled';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Swiper from 'swiper';
import { Navigation, Pagination } from 'swiper/modules';
import dayjs from 'dayjs';
import 'swiper/css';
import 'swiper/css/navigation';
import 'swiper/css/pagination';

gsap.registerPlugin(ScrollTrigger);

const Home = () => {
  const [remainingDays, setRemainingDays] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [messages, setMessages] = useState(() => {
    const savedMessages = localStorage.getItem('weddingMessages');
    return savedMessages ? JSON.parse(savedMessages) : [];
  });
  const [newMessage, setNewMessage] = useState({
    name: '',
    password: '',
    content: ''
  });
  const [editingMessage, setEditingMessage] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [sortOrder, setSortOrder] = useState('newest'); // 'newest' or 'oldest'
  const [searchTerm, setSearchTerm] = useState('');
  const containerRef = useRef(null);
  const loadingRef = useRef(null);
  const audioRef = useRef(null);

  // 메시지 저장
  useEffect(() => {
    localStorage.setItem('weddingMessages', JSON.stringify(messages));
  }, [messages]);

  // 메시지 정렬 및 검색
  const filteredAndSortedMessages = messages
    .filter(message => 
      message.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      message.content.toLowerCase().includes(searchTerm.toLowerCase())
    )
    .sort((a, b) => {
      if (sortOrder === 'newest') {
        return b.id - a.id;
      } else {
        return a.id - b.id;
      }
    });

  useEffect(() => {
    // 로딩 애니메이션
    const loadingTl = gsap.timeline();
    loadingTl.to(loadingRef.current, {
      opacity: 0,
      duration: 1,
      delay: 1,
      onComplete: () => {
        if (loadingRef.current) {
          loadingRef.current.style.display = 'none';
        }
      }
    });

    // D-day 계산
    const weddingDate = dayjs('2024-03-09');
    const today = dayjs();
    const diff = weddingDate.diff(today, 'day');
    setRemainingDays(diff);

    // KV 섹션 애니메이션
    const kvTl = gsap.timeline({
      scrollTrigger: {
        trigger: '.nav_cont_kv',
        start: 'top center',
        end: 'bottom center',
        toggleActions: 'play none none reverse'
      }
    });

    kvTl
      .from('.nav_cont_kv .KvFlower', {
        opacity: 0,
        y: -50,
        duration: 1.5,
        ease: 'power2.out'
      })
      .from('.nav_cont_kv .KvTit', {
        opacity: 0,
        scale: 0.8,
        duration: 1,
        ease: 'back.out(1.7)'
      }, '-=0.5')
      .from('.nav_cont_kv .KvTxt span', {
        opacity: 0,
        y: 30,
        duration: 0.8,
        stagger: 0.2,
        ease: 'power2.out'
      }, '-=0.3')
      .from('.nav_cont_kv .KvImg', {
        opacity: 0,
        y: 50,
        duration: 1.2,
        ease: 'power2.out'
      }, '-=0.5');

    // 갤러리 섹션 애니메이션
    const galleryTl = gsap.timeline({
      scrollTrigger: {
        trigger: '.nav_cont_gallery',
        start: 'top center',
        end: 'bottom center',
        toggleActions: 'play none none reverse'
      }
    });

    galleryTl
      .from('.gallery_thumb .thumb', {
        opacity: 0,
        scale: 0.8,
        duration: 1,
        stagger: 0.3,
        ease: 'power2.out'
      });

    // 지도 섹션 애니메이션
    const mapTl = gsap.timeline({
      scrollTrigger: {
        trigger: '.nav_cont_map',
        start: 'top center',
        end: 'bottom center',
        toggleActions: 'play none none reverse'
      }
    });

    mapTl
      .from('#map', {
        opacity: 0,
        y: 50,
        duration: 1,
        ease: 'power2.out'
      });

    // Swiper 초기화
    const swiper = new Swiper('.gallery_thumb', {
      modules: [Navigation, Pagination],
      spaceBetween: 30,
      loop: true,
      autoplay: {
        delay: 3000,
        disableOnInteraction: false,
      },
      pagination: {
        el: '.swiper-pagination',
        clickable: true,
      },
    });

    // Kakao 지도 초기화
    const initMap = () => {
      if (window.kakao && window.kakao.maps) {
        const container = document.getElementById('map');
        const options = {
          center: new window.kakao.maps.LatLng(37.5487194, 126.6676776),
          level: 4
        };
        const map = new window.kakao.maps.Map(container, options);
        const markerPosition = new window.kakao.maps.LatLng(37.5487194, 126.6676776);
        const marker = new window.kakao.maps.Marker({
          position: markerPosition
        });
        marker.setMap(map);
      } else {
        // SDK가 로드되지 않은 경우 1초 후 다시 시도
        setTimeout(initMap, 1000);
      }
    };

    initMap();

    // 축하 메시지 섹션 애니메이션
    const messageTl = gsap.timeline({
      scrollTrigger: {
        trigger: '.nav_cont_message',
        start: 'top center',
        end: 'bottom center',
        toggleActions: 'play none none reverse'
      }
    });

    messageTl
      .from('.message-box', {
        opacity: 0,
        y: 30,
        duration: 1,
        stagger: 0.2,
        ease: 'power2.out'
      });

    // 계좌번호 섹션 애니메이션
    const accountTl = gsap.timeline({
      scrollTrigger: {
        trigger: '.nav_cont_account',
        start: 'top center',
        end: 'bottom center',
        toggleActions: 'play none none reverse'
      }
    });

    accountTl
      .from('.account-box', {
        opacity: 0,
        y: 30,
        duration: 1,
        stagger: 0.2,
        ease: 'power2.out'
      });

    // 카카오톡 공유하기 초기화
    if (window.Kakao) {
      window.Kakao.Link.createDefaultButton({
        container: '#kakao-share-btn',
        objectType: 'feed',
        content: {
          title: '승도🧡아영 결혼식에 초대합니다.',
          description: '2024.03.09 16:30 인천 아시아드 웨딩컨벤션 브릴리에 홀',
          imageUrl: 'https://your-domain.com/share/share_800x400.jpg',
          link: {
            mobileWebUrl: window.location.href,
            webUrl: window.location.href,
          },
        },
        buttons: [
          {
            title: '청첩장 보기',
            link: {
              mobileWebUrl: window.location.href,
              webUrl: window.location.href,
            },
          },
        ],
      });
    }

    // 방명록 섹션 애니메이션
    const guestbookTl = gsap.timeline({
      scrollTrigger: {
        trigger: '.nav_cont_guestbook',
        start: 'top center',
        end: 'bottom center',
        toggleActions: 'play none none reverse'
      }
    });

    guestbookTl
      .from('.message-item', {
        opacity: 0,
        y: 30,
        duration: 0.8,
        stagger: 0.2,
        ease: 'power2.out'
      });

    // 클린업 함수
    return () => {
      loadingTl.kill();
      kvTl.kill();
      galleryTl.kill();
      mapTl.kill();
      messageTl.kill();
      accountTl.kill();
      guestbookTl.kill();
      ScrollTrigger.getAll().forEach(trigger => trigger.kill());
    };
  }, []);

  const toggleMusic = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!newMessage.name || !newMessage.password || !newMessage.content) {
      alert('모든 필드를 입력해주세요.');
      return;
    }

    if (editingMessage) {
      // 메시지 수정
      setMessages(messages.map(msg => 
        msg.id === editingMessage.id 
          ? { ...msg, ...newMessage, date: new Date().toLocaleDateString() }
          : msg
      ));
      setEditingMessage(null);
    } else {
      // 새 메시지 추가
      const message = {
        ...newMessage,
        id: Date.now(),
        date: new Date().toLocaleDateString()
      };
      setMessages([message, ...messages]);
    }

    setNewMessage({ name: '', password: '', content: '' });
    setShowForm(false);
  };

  const handleEdit = (message) => {
    setNewMessage({
      name: message.name,
      password: message.password,
      content: message.content
    });
    setEditingMessage(message);
    setShowForm(true);
  };

  const handleDelete = (id, password) => {
    const messageToDelete = messages.find(msg => msg.id === id);
    if (messageToDelete && messageToDelete.password === password) {
      setMessages(messages.filter(msg => msg.id !== id));
    } else {
      alert('비밀번호가 일치하지 않습니다.');
    }
  };

  const handleCancel = () => {
    setNewMessage({ name: '', password: '', content: '' });
    setEditingMessage(null);
    setShowForm(false);
  };

  return (
    <Container ref={containerRef}>
      <Loading ref={loadingRef} id="loading">
        <span>Loading...</span>
      </Loading>
      <Wrapper className="evWrap">
        {/* KV 섹션 */}
        <Section className="nav_cont nav_cont_kv">
          <NavWrap>
            <KvFlower className="KvFlower">
              <img src="/images/top_flower.png" alt="꽃 장식" />
            </KvFlower>
            <KvTit className="KvTit">
              <span><img src="/images/tit.png" alt="결혼식 제목" /></span>
            </KvTit>
            <KvTxt className="KvTxt">
              <span className="date box">2024.03.09 PM 16:30</span>
              <span className="loca box">인천 아시아드 웨딩 컨벤션 (브릴리에 홀)</span>
              <span className="dday box">D-{remainingDays}</span>
            </KvTxt>
            <KvBox>
              <KvWrap>
                <KvImg className="KvImg">
                  <img src="/images/kv_img.png" alt="메인 이미지" />
                </KvImg>
              </KvWrap>
              <OrbitLine>
                <img src="/images/orbit_line.png" alt="궤도 라인" />
              </OrbitLine>
              <OrbitHeart>
                <img src="/images/orbit_heart.png" alt="궤도 하트" />
              </OrbitHeart>
              <OrbitCircle>
                <img src="/images/orbit_circle.png" alt="궤도 원" />
              </OrbitCircle>
            </KvBox>
          </NavWrap>
        </Section>

        {/* 갤러리 섹션 */}
        <GallerySection className="nav_cont nav_cont_gallery">
          <NavWrap>
            <div className="gallery_thumb swiper">
              <div className="swiper-wrapper">
                <div className="swiper-slide thumb">
                  <img src="/images/gallery1.jpg" alt="웨딩 포토 1" />
                </div>
                <div className="swiper-slide thumb">
                  <img src="/images/gallery2.jpg" alt="웨딩 포토 2" />
                </div>
                <div className="swiper-slide thumb">
                  <img src="/images/gallery3.jpg" alt="웨딩 포토 3" />
                </div>
                <div className="swiper-slide thumb">
                  <img src="/images/gallery4.jpg" alt="웨딩 포토 4" />
                </div>
                <div className="swiper-slide thumb">
                  <img src="/images/gallery5.jpg" alt="웨딩 포토 5" />
                </div>
              </div>
              <div className="swiper-pagination"></div>
            </div>
          </NavWrap>
        </GallerySection>

        {/* 지도 섹션 */}
        <MapSection className="nav_cont nav_cont_map">
          <NavWrap>
            <div id="map"></div>
          </NavWrap>
        </MapSection>

        {/* 축하 메시지 섹션 */}
        <MessageSection className="nav_cont nav_cont_message">
          <NavWrap>
            <h2 className="section-title">축하 메시지</h2>
            <div className="message-container">
              <div className="message-box">
                <p className="message-text">"행복한 결혼을 진심으로 축하합니다. 앞으로의 여정이 더욱 아름답고 행복하기를 바랍니다."</p>
                <p className="message-author">- 아버지, 어머니</p>
              </div>
              <div className="message-box">
                <p className="message-text">"두 분의 사랑이 영원히 이어지길 바랍니다. 축하합니다!"</p>
                <p className="message-author">- 형, 누나</p>
              </div>
              <div className="message-box">
                <p className="message-text">"새로운 시작을 축하합니다. 행복한 결혼 생활 되세요!"</p>
                <p className="message-author">- 친구들</p>
              </div>
            </div>
          </NavWrap>
        </MessageSection>

        {/* 계좌번호 섹션 */}
        <AccountSection className="nav_cont nav_cont_account">
          <NavWrap>
            <h2 className="section-title">마음 전하실 곳</h2>
            <div className="account-container">
              <div className="account-box">
                <h3>신랑측 계좌</h3>
                <p className="bank-name">국민은행</p>
                <p className="account-number">123-456-789012</p>
                <p className="account-holder">홍길동</p>
              </div>
              <div className="account-box">
                <h3>신부측 계좌</h3>
                <p className="bank-name">신한은행</p>
                <p className="account-number">987-654-321098</p>
                <p className="account-holder">김철수</p>
              </div>
            </div>
          </NavWrap>
        </AccountSection>

        {/* 공유하기 섹션 */}
        <ShareSection className="nav_cont nav_cont_share">
          <NavWrap>
            <h2 className="section-title">청첩장 공유하기</h2>
            <div className="share-container">
              <button id="kakao-share-btn" className="share-btn kakao">
                <img src="/images/kakao_share.png" alt="카카오톡 공유하기" />
                <span>카카오톡 공유하기</span>
              </button>
              <button 
                className="share-btn copy"
                onClick={() => {
                  navigator.clipboard.writeText(window.location.href);
                  alert('청첩장 링크가 복사되었습니다.');
                }}
              >
                <img src="/images/copy_icon.png" alt="링크 복사하기" />
                <span>링크 복사하기</span>
              </button>
            </div>
          </NavWrap>
        </ShareSection>

        {/* 방명록 섹션 */}
        <GuestbookSection className="nav_cont nav_cont_guestbook">
          <NavWrap>
            <h2 className="section-title">방명록</h2>
            <div className="guestbook-container">
              <div className="guestbook-controls">
                <div className="search-box">
                  <input
                    type="text"
                    placeholder="이름 또는 내용으로 검색"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
                <div className="sort-box">
                  <select 
                    value={sortOrder}
                    onChange={(e) => setSortOrder(e.target.value)}
                  >
                    <option value="newest">최신순</option>
                    <option value="oldest">오래된순</option>
                  </select>
                </div>
              </div>

              {!showForm ? (
                <button 
                  className="write-btn"
                  onClick={() => setShowForm(true)}
                >
                  <img src="/img/write_icon.png" alt="글쓰기" />
                  <span>{editingMessage ? '메시지 수정하기' : '축하 메시지 남기기'}</span>
                </button>
              ) : (
                <form className="message-form" onSubmit={handleSubmit}>
                  <div className="form-group">
                    <input
                      type="text"
                      placeholder="이름"
                      value={newMessage.name}
                      onChange={(e) => setNewMessage({...newMessage, name: e.target.value})}
                    />
                  </div>
                  <div className="form-group">
                    <input
                      type="password"
                      placeholder="비밀번호"
                      value={newMessage.password}
                      onChange={(e) => setNewMessage({...newMessage, password: e.target.value})}
                    />
                  </div>
                  <div className="form-group">
                    <textarea
                      placeholder="축하 메시지를 남겨주세요"
                      value={newMessage.content}
                      onChange={(e) => setNewMessage({...newMessage, content: e.target.value})}
                    />
                  </div>
                  <div className="form-buttons">
                    <button type="submit" className="submit-btn">
                      {editingMessage ? '수정하기' : '등록하기'}
                    </button>
                    <button 
                      type="button" 
                      className="cancel-btn"
                      onClick={handleCancel}
                    >
                      취소하기
                    </button>
                  </div>
                </form>
              )}

              <div className="messages-list">
                {filteredAndSortedMessages.length === 0 ? (
                  <div className="no-messages">
                    {searchTerm ? '검색 결과가 없습니다.' : '아직 작성된 메시지가 없습니다.'}
                  </div>
                ) : (
                  filteredAndSortedMessages.map((message) => (
                    <div key={message.id} className="message-item">
                      <div className="message-header">
                        <span className="message-name">{message.name}</span>
                        <span className="message-date">{message.date}</span>
                      </div>
                      <p className="message-content">{message.content}</p>
                      <div className="message-actions">
                        <button
                          className="edit-btn"
                          onClick={() => handleEdit(message)}
                        >
                          수정
                        </button>
                        <button
                          className="delete-btn"
                          onClick={() => {
                            const password = prompt('비밀번호를 입력하세요');
                            if (password) {
                              handleDelete(message.id, password);
                            }
                          }}
                        >
                          삭제
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </NavWrap>
        </GuestbookSection>

        {/* 음악 플레이어 */}
        <MusicPlayer>
          <button 
            className={`music-toggle ${isPlaying ? 'playing' : ''}`}
            onClick={toggleMusic}
          >
            <img src="/images/music_icon.png" alt="음악 재생/정지" />
          </button>
          <audio
            ref={audioRef}
            src="/music/wedding_music.mp3"
            loop
          />
        </MusicPlayer>
      </Wrapper>
    </Container>
  );
};

// Styled Components
const Container = styled.div`
  width: 100%;
  min-height: 100vh;
  background: #e4e6d8;
  font-family: 'Noto Serif KR', serif;
  overflow-x: hidden;

  @keyframes orbit {
    0% {
      transform: translateX(-50%) rotate(0deg) translateX(300px) rotate(0deg);
    }
    100% {
      transform: translateX(-50%) rotate(360deg) translateX(300px) rotate(-360deg);
    }
  }

  @keyframes orbit2 {
    0% {
      transform: translateX(-50%) rotate(0deg) translateX(250px) rotate(0deg);
    }
    100% {
      transform: translateX(-50%) rotate(-360deg) translateX(250px) rotate(360deg);
    }
  }

  @keyframes float {
    0% {
      transform: translateY(0px);
    }
    50% {
      transform: translateY(-20px);
    }
    100% {
      transform: translateY(0px);
    }
  }
`;

const Loading = styled.div`
  position: fixed;
  width: 100vw;
  height: 100vh;
  background: #e4e6d8;
  z-index: 50;
  display: flex;
  justify-content: center;
  align-items: center;
  font-size: 24px;
  color: #70754c;
`;

const Wrapper = styled.div`
  width: 100%;
  max-width: 750px;
  min-height: 100vh;
  margin: 0 auto;
  background: #e4e6d8;
  color: #70754c;
  position: relative;
  overflow: hidden;
  box-sizing: border-box;
  padding: 0 15px;

  @media (max-width: 768px) {
    padding: 0 10px;
  }
`;

const Section = styled.section`
  width: 100%;
  margin: 0 auto;
  position: relative;
  padding: 50px 0;

  @media (max-width: 768px) {
    padding: 30px 0;
  }
`;

const NavWrap = styled.div`
  position: relative;
  width: 100%;
  margin: 0 auto;
  border: 3px solid #6F744C;
  border-top: none;
  border-bottom: none;
  background: url('/images/kv_paper.jpg') repeat center center;
  box-sizing: border-box;
  padding: 20px;

  @media (max-width: 768px) {
    padding: 15px;
  }
`;

const KvFlower = styled.div`
  position: absolute;
  top: 0;
  left: 50%;
  width: 100%;
  max-width: 827px;
  transform: translateX(-50%);
  z-index: 11;
  opacity: 1;

  img {
    width: 100%;
    height: auto;
    display: block;
    opacity: 0.5;
  }
`;

const KvTit = styled.div`
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 11;
  width: 100%;
  max-width: 256px;
  opacity: 1;
  
  span {
    display: block;
    width: 100%;

    img {
      width: 100%;
      height: auto;
      display: block;
      opacity: 1;
    }
  }

  @media (max-width: 768px) {
    max-width: 200px;
  }
`;

const KvTxt = styled.div`
  position: absolute;
  top: 60%;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  width: 100%;
  z-index: 11;
  gap: 10px;
  opacity: 1;

  span {
    display: block;
    line-height: 1.5;
    letter-spacing: -0.5px;
    color: #70754c;
    text-align: center;
    opacity: 1;
    
    &.date {
      font-weight: 500;
      font-size: 28px;
    }
    
    &.loca {
      font-size: 22px;
    }

    &.dday {
      font-size: 24px;
      font-weight: 700;
      margin-top: 10px;
    }
  }

  @media (max-width: 768px) {
    gap: 5px;

    span {
      &.date {
        font-size: 24px;
      }
      
      &.loca {
        font-size: 18px;
      }

      &.dday {
        font-size: 20px;
      }
    }
  }
`;

const KvBox = styled.div`
  position: relative;
  padding-top: 102px;
  width: 100%;
  opacity: 1;
`;

const KvWrap = styled.div`
  z-index: 10;
  position: relative;
  width: 100%;
  height: auto;
  margin: 0 auto;
  border-radius: 100vw 100vw 0 0;
  border: 3px solid #6F744C;
  border-bottom: none;
  overflow: hidden;
  background: url('/images/kv_paper.jpg') repeat center center;
  box-sizing: border-box;
  opacity: 1;
`;

const KvImg = styled.div`
  width: 100%;
  max-width: 620px;
  height: auto;
  margin: 30px auto 0;
  opacity: 1;
  animation: float 6s ease-in-out infinite;

  img {
    width: 100%;
    height: auto;
    display: block;
    opacity: 1;
  }

  @media (max-width: 768px) {
    margin: 20px auto 0;
  }
`;

const OrbitLine = styled.div`
  position: absolute;
  top: 85px;
  left: 50%;
  transform: translateX(-50%);
  width: 100%;
  max-width: 663px;
  z-index: 11;
  opacity: 1;

  img {
    width: 100%;
    height: auto;
    display: block;
    opacity: 1;
  }
`;

const OrbitHeart = styled.div`
  z-index: 11;
  position: absolute;
  top: 75px;
  left: 50%;
  transform: translateX(-50%);
  display: block;
  width: 34px;
  height: 26px;
  will-change: transform;
  animation: orbit 10s linear infinite;

  img {
    width: 100%;
    height: auto;
    display: block;
    opacity: 1;
  }

  @media (max-width: 768px) {
    width: 24px;
    height: 18px;
  }
`;

const OrbitCircle = styled.div`
  z-index: 11;
  position: absolute;
  top: 75px;
  left: 50%;
  transform: translateX(-50%);
  display: block;
  width: 21px;
  height: 21px;
  will-change: transform;
  animation: orbit2 8s linear infinite;

  img {
    width: 100%;
    height: auto;
    display: block;
    opacity: 1;
  }

  @media (max-width: 768px) {
    width: 16px;
    height: 16px;
  }
`;

// 갤러리 섹션 스타일
const GallerySection = styled(Section)`
  .gallery_thumb {
    width: 100%;
    height: 400px;
    margin: 0 auto;
    overflow: hidden;

    .swiper-slide {
      width: 100%;
      height: 100%;
      display: flex;
      justify-content: center;
      align-items: center;

      img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
    }

    .swiper-pagination {
      bottom: 20px;
    }
  }

  @media (max-width: 768px) {
    .gallery_thumb {
      height: 300px;
    }
  }
`;

// 지도 섹션 스타일
const MapSection = styled(Section)`
  #map {
    width: 100%;
    height: 400px;
    border-radius: 10px;
    overflow: hidden;
  }

  @media (max-width: 768px) {
    #map {
      height: 300px;
    }
  }
`;

// 축하 메시지 섹션 스타일
const MessageSection = styled(Section)`
  .section-title {
    font-size: 28px;
    font-weight: 700;
    text-align: center;
    margin-bottom: 30px;
    color: #70754c;
  }

  .message-container {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .message-box {
    background: rgba(255, 255, 255, 0.8);
    padding: 20px;
    border-radius: 10px;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
  }

  .message-text {
    font-size: 18px;
    line-height: 1.6;
    color: #70754c;
    margin-bottom: 10px;
  }

  .message-author {
    font-size: 16px;
    color: #70754c;
    text-align: right;
    font-style: italic;
  }

  @media (max-width: 768px) {
    .section-title {
      font-size: 24px;
    }

    .message-text {
      font-size: 16px;
    }

    .message-author {
      font-size: 14px;
    }
  }
`;

// 계좌번호 섹션 스타일
const AccountSection = styled(Section)`
  .section-title {
    font-size: 28px;
    font-weight: 700;
    text-align: center;
    margin-bottom: 30px;
    color: #70754c;
  }

  .account-container {
    display: flex;
    justify-content: space-around;
    gap: 20px;
  }

  .account-box {
    background: rgba(255, 255, 255, 0.8);
    padding: 20px;
    border-radius: 10px;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
    text-align: center;
    flex: 1;
  }

  h3 {
    font-size: 20px;
    font-weight: 700;
    color: #70754c;
    margin-bottom: 15px;
  }

  .bank-name {
    font-size: 18px;
    color: #70754c;
    margin-bottom: 10px;
  }

  .account-number {
    font-size: 16px;
    color: #70754c;
    margin-bottom: 5px;
    word-break: break-all;
  }

  .account-holder {
    font-size: 16px;
    color: #70754c;
  }

  @media (max-width: 768px) {
    .section-title {
      font-size: 24px;
    }

    .account-container {
      flex-direction: column;
    }

    h3 {
      font-size: 18px;
    }

    .bank-name {
      font-size: 16px;
    }

    .account-number, .account-holder {
      font-size: 14px;
    }
  }
`;

// 공유하기 섹션 스타일
const ShareSection = styled(Section)`
  .section-title {
    font-size: 28px;
    font-weight: 700;
    text-align: center;
    margin-bottom: 30px;
    color: #70754c;
  }

  .share-container {
    display: flex;
    justify-content: center;
    gap: 20px;
  }

  .share-btn {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 24px;
    border: none;
    border-radius: 50px;
    font-size: 16px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.3s ease;

    img {
      width: 24px;
      height: 24px;
    }

    &.kakao {
      background: #FEE500;
      color: #000000;

      &:hover {
        background: #FFD700;
      }
    }

    &.copy {
      background: #70754c;
      color: #ffffff;

      &:hover {
        background: #5a5d3d;
      }
    }
  }

  @media (max-width: 768px) {
    .section-title {
      font-size: 24px;
    }

    .share-container {
      flex-direction: column;
      align-items: center;
    }

    .share-btn {
      width: 100%;
      justify-content: center;
    }
  }
`;

// 음악 플레이어 스타일
const MusicPlayer = styled.div`
  position: fixed;
  bottom: 20px;
  right: 20px;
  z-index: 100;

  .music-toggle {
    width: 50px;
    height: 50px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.9);
    border: 2px solid #70754c;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.3s ease;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);

    img {
      width: 24px;
      height: 24px;
    }

    &.playing {
      animation: rotate 3s linear infinite;
    }

    &:hover {
      transform: scale(1.1);
    }
  }

  @keyframes rotate {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }

  @media (max-width: 768px) {
    bottom: 10px;
    right: 10px;

    .music-toggle {
      width: 40px;
      height: 40px;

      img {
        width: 20px;
        height: 20px;
      }
    }
  }
`;

// 방명록 섹션 스타일 업데이트
const GuestbookSection = styled(Section)`
  .section-title {
    font-size: 28px;
    font-weight: 700;
    text-align: center;
    margin-bottom: 30px;
    color: #70754c;
  }

  .guestbook-container {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .guestbook-controls {
    display: flex;
    gap: 15px;
    margin-bottom: 20px;

    @media (max-width: 768px) {
      flex-direction: column;
    }
  }

  .search-box {
    flex: 1;

    input {
      width: 100%;
      padding: 10px;
      border: 1px solid #70754c;
      border-radius: 5px;
      font-size: 16px;
      color: #70754c;

      &:focus {
        outline: none;
        border-color: #5a5d3d;
      }
    }
  }

  .sort-box {
    select {
      padding: 10px;
      border: 1px solid #70754c;
      border-radius: 5px;
      font-size: 16px;
      color: #70754c;
      background: white;
      cursor: pointer;

      &:focus {
        outline: none;
        border-color: #5a5d3d;
      }
    }
  }

  .no-messages {
    text-align: center;
    padding: 20px;
    color: #70754c;
    font-size: 16px;
    background: rgba(255, 255, 255, 0.8);
    border-radius: 10px;
  }

  .message-actions {
    display: flex;
    gap: 10px;
    position: absolute;
    bottom: 10px;
    right: 10px;
  }

  .edit-btn, .delete-btn {
    padding: 5px 10px;
    background: none;
    border: none;
    color: #70754c;
    font-size: 14px;
    cursor: pointer;
    opacity: 0.7;
    transition: opacity 0.3s ease;

    &:hover {
      opacity: 1;
    }
  }

  .edit-btn {
    color: #5a5d3d;
  }

  .delete-btn {
    color: #d32f2f;
  }

  .write-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 12px 24px;
    background: #70754c;
    color: #ffffff;
    border: none;
    border-radius: 50px;
    font-size: 16px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.3s ease;

    img {
      width: 20px;
      height: 20px;
    }

    &:hover {
      background: #5a5d3d;
    }
  }

  .message-form {
    background: rgba(255, 255, 255, 0.8);
    padding: 20px;
    border-radius: 10px;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
  }

  .form-group {
    margin-bottom: 15px;

    input, textarea {
      width: 100%;
      padding: 10px;
      border: 1px solid #70754c;
      border-radius: 5px;
      font-size: 16px;
      color: #70754c;

      &:focus {
        outline: none;
        border-color: #5a5d3d;
      }
    }

    textarea {
      height: 100px;
      resize: vertical;
    }
  }

  .form-buttons {
    display: flex;
    gap: 10px;
    justify-content: flex-end;
  }

  .submit-btn, .cancel-btn {
    padding: 8px 16px;
    border: none;
    border-radius: 5px;
    font-size: 14px;
    cursor: pointer;
    transition: all 0.3s ease;
  }

  .submit-btn {
    background: #70754c;
    color: #ffffff;

    &:hover {
      background: #5a5d3d;
    }
  }

  .cancel-btn {
    background: #e4e6d8;
    color: #70754c;

    &:hover {
      background: #d4d6c8;
    }
  }

  .messages-list {
    display: flex;
    flex-direction: column;
    gap: 15px;
  }

  .message-item {
    background: rgba(255, 255, 255, 0.8);
    padding: 15px;
    border-radius: 10px;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
    position: relative;
  }

  .message-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 10px;
  }

  .message-name {
    font-weight: 700;
    color: #70754c;
  }

  .message-date {
    font-size: 14px;
    color: #70754c;
  }

  .message-content {
    font-size: 16px;
    line-height: 1.6;
    color: #70754c;
    margin-bottom: 10px;
  }

  @media (max-width: 768px) {
    .section-title {
      font-size: 24px;
    }

    .write-btn {
      width: 100%;
    }

    .form-buttons {
      flex-direction: column;
    }

    .submit-btn, .cancel-btn {
      width: 100%;
    }
  }
`;

export default Home; 