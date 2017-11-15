import PropTypes from 'prop-types';
import style from './style.scss';
import '../styles/global.css';

/**
 * @render react
 * @name HeroButton
 * @description CTA button for `Hero` featured content
 * @example
 * <HeroButton text="Im a Hero!" primary />
 */
const HeroButton = ({ text, primary }) => (
  <a href="#" className={style.Button} data-primary={primary}>
    {text}
  </a>
);

HeroButton.propTypes = {
  /**
   * @property {boolean} primary determines is a primary button (emphasized)
   */
  primary: PropTypes.bool,

  /**
   * @property {string} text label to be displayed within the button
   */
  text: PropTypes.string
};

HeroButton.defaultProps = {
  text: 'Hero Button!',
  primary: true
};

export default HeroButton;
