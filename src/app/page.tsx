'use client';

import { useState } from 'react';
import { experiences, projects } from '@/lib/constants';

export default function Home() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (element) {
      const offset = 80; // Account for mobile header height
      const elementPosition = element.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.pageYOffset - offset;
      
      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth'
      });
    }
    setIsMobileMenuOpen(false);
  };

  return (
    <div className="min-h-screen bg-white text-black">
      {/* Mobile Navigation */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-white border-b border-gray-200">
        <div className="flex justify-end items-center px-4 py-3">
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="p-2"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>
        {isMobileMenuOpen && (
          <div className="border-t border-gray-200 bg-white">
            <nav className="px-4 py-2 space-y-1">
              <button
                onClick={() => scrollToSection('about')}
                className="block w-full text-left py-2 px-3 hover:bg-gray-50 text-sm text-blue-600"
              >
                About
              </button>
              <button
                onClick={() => scrollToSection('work')}
                className="block w-full text-left py-2 px-3 hover:bg-gray-50 text-sm text-blue-600"
              >
                Work
              </button>
              <div className="pl-4 space-y-1">
                <button
                  onClick={() => scrollToSection('experience')}
                  className="block w-full text-left py-1 px-3 text-xs text-blue-600 hover:bg-gray-50"
                >
                  Experience
                </button>
                <button
                  onClick={() => scrollToSection('projects')}
                  className="block w-full text-left py-1 px-3 text-xs text-blue-600 hover:bg-gray-50"
                >
                  Projects
                </button>
              </div>
              
              {/* Mobile Social Links */}
              <div className="border-t border-gray-200 mt-4 pt-4">
                <div className="flex space-x-4">
                  <a
                    href="https://github.com/navkul"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-blue-600 hover:underline"
                  >
                    GitHub
                  </a>
                  <a
                    href="https://www.linkedin.com/in/arnav-a-kulkarni/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-blue-600 hover:underline"
                  >
                    LinkedIn
                  </a>
                  <a
                    href="mailto:akul@bu.edu"
                    className="text-sm text-blue-600 hover:underline"
                  >
                    Email
                  </a>
                </div>
              </div>
            </nav>
          </div>
        )}
      </div>

      {/* Desktop Layout */}
      <div className="lg:flex lg:min-h-screen">
        {/* Main Content */}
        <main className="flex-1 lg:ml-0 lg:pt-0 pt-16">
          <div className="max-w-4xl mx-auto px-6 py-12 lg:py-20">
            
            {/* About Section */}
            <section id="about" className="mb-12">
              <h2 className="text-3xl font-medium mb-12">ABOUT</h2>
              <div className="max-w-2xl">
                <p className="text-md leading-relaxed">
                  I'm Arnav, a student at Boston University pursuing B.A's in both Computer Science and Economics.
                  I'm generally interested in distributed systems, but my previous internship at Grepr has me obsesed with
                  stateful, fault-tolerant, stream processing engines. In my free time, I live and breathe soccer(Arsenal fan unforunately), lift weights,
                  geek out about new AI tools, and attempt to improve my reading and writing skills.
                </p>
              </div>
            </section>

            {/* Work Section */}
            <section id="work" className="mb-12">
              <h2 className="text-3xl font-medium mb-12">WORK</h2>
              
              {/* Experience Subsection */}
              <div id="experience" className="mb-12">
                <h3 className="text-2xl font-medium mb-8">EXPERIENCE</h3>
                <div className="max-w-3xl space-y-8">
                  {experiences.map((experience, index) => (
                    <div key={index}>
                      <h4 className="text-xl font-medium mb-2">{experience.title}</h4>
                      <p className="text-gray-600 mb-2">{experience.company} • {experience.period}</p>
                      <p className="text-sm leading-relaxed">{experience.description}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Projects Subsection */}
              <div id="projects">
                <h3 className="text-2xl font-medium mb-8">PROJECTS</h3>
                <div className="max-w-4xl grid md:grid-cols-2 gap-8">
                  {projects.map((project, index) => (
                    <div key={index}>
                      <h4 className="text-xl font-medium mb-2">{project.title}</h4>
                      <p className="text-gray-600 mb-2">{project.type}</p>
                      <p className="text-sm leading-relaxed">{project.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          </div>
        </main>

        {/* Desktop Index Navigation */}
        <aside className="hidden lg:block w-64 border-l border-gray-200 bg-gray-50">
          <div className="sticky top-0 p-6">
            {/* Desktop Social Links */}
            <div className="flex space-x-4 mb-6">
              <a
                href="https://github.com/navkul"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-600 hover:underline"
              >
                GitHub
              </a>
              <a
                href="https://www.linkedin.com/in/arnav-a-kulkarni/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-600 hover:underline"
              >
                LinkedIn
              </a>
              <a
                href="mailto:akul@bu.edu"
                className="text-sm text-blue-600 hover:underline"
              >
                Email
              </a>
            </div>
            
            <nav className="space-y-4">
              <div>
                <a
                  href="#about"
                  onClick={(e) => {
                    e.preventDefault();
                    scrollToSection('about');
                  }}
                  className="block text-sm text-blue-600"
                >
                  About
                </a>
              </div>
              
              <div>
                <a
                  href="#work"
                  onClick={(e) => {
                    e.preventDefault();
                    scrollToSection('work');
                  }}
                  className="block text-sm text-blue-600"
                >
                  Work
                </a>
                <div className="ml-4 mt-2 space-y-2">
                  <a
                    href="#experience"
                    onClick={(e) => {
                      e.preventDefault();
                      scrollToSection('experience');
                    }}
                    className="block text-xs text-blue-600"
                  >
                    Experience
                  </a>
                  <a
                    href="#projects"
                    onClick={(e) => {
                      e.preventDefault();
                      scrollToSection('projects');
                    }}
                    className="block text-xs text-blue-600"
                  >
                    Projects
                  </a>
                </div>
              </div>
            </nav>
          </div>
        </aside>
      </div>
    </div>
  );
}
