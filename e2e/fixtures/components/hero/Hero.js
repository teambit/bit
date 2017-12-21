import HeroButton from '@bit/{remoteScope}.test.hero-button';
import style from './style.scss';
import global from '@bit/{remoteScope}.test.styles';

/**
 * @render react
 * @name Hero
 * @description Netflix's Hero banner, shows our featured content.
 * @example
 * <Hero
 *   title="Season 66 will be available soon!"
 *   description="Lorem ipsum dolor sit amet hey! id quam sapiente unde voluptatum alias vero debitis, magnam quis quod."
 * />
 */
const Hero = ({ title, description }) => (
  <div className={style.Hero} style={{ backgroundImage: 'url(https://images.alphacoders.com/633/633643.jpg)' }}>
    <div className={style.content}>
      <img
        className={style.logo}
        src="http://www.returndates.com/backgrounds/narcos.logo.png"
        alt="narcos background"
      />
      <h2>{title}</h2>
      <p>{description}</p>
      <div className={style['button-wrapper']}>
        <HeroButton primary text="Watch now" />
        <HeroButton primary={false} text="+ My list" />
      </div>
    </div>
    <div className={style.overlay} />
  </div>
);

Hero.defaultProps = {
  title: 'Season 2 now available!',
  description:
    'Lorem ipsum dolor sit amet, consectetur adipisicing elit. Doloremque id quam sapiente unde voluptatum alias vero debitis, magnam quis quod.'
};

export default Hero;
