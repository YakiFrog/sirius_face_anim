import React from 'react'
import Head from 'next/head'

import { P5Sketch } from '../components/P5Sketch'

export default function HomePage() {
  return (
    <React.Fragment>
      <Head>
        <title>p5.js Full Screen Demo</title>
        <style jsx global>{`
          html, body, #__next {
            margin: 0;
            padding: 0;
            width: 100%;
            height: 100vh;
            overflow: hidden;
          }
          
          .sketch-container {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            display: block;
          }
          
          canvas {
            display: block;
          }
        `}</style>
      </Head>
      <div className="sketch-container">
        <P5Sketch fullScreen={true} />
      </div>
    </React.Fragment>
  )
}
