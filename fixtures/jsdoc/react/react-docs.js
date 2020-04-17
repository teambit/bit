import React, { Component } from 'react';
import PropTypes from 'prop-types';

/**
 * @description Styled button component for the rich and famous!
 *
 * @example
 * <Button
 *   text="Example button text"
 *   buttonColor="red"
 *   buttonHoverColor="green"
 * />
 */

class Button extends Component {
  constructor(props) {
    super(props);

    this.state = {
      hover: false,
      text: this.props.text
    };

    this.toggleHover = this.toggleHover.bind(this);
    this.showAlert = this.showAlert.bind(this);
  }

  toggleHover() {
    this.setState({ hover: !this.state.hover });
  }

  showAlert() {
    alert('Button clicked');
    this.setState({ text: 'Button clicked' });
  }

  render() {
    const style = {
      width: '18%',
      height: '40px',
      display: 'inline-block',
      fontFamily: 'Apple',
      boxShadow: '4px 5px 5px #888888',
      backgroundColor: this.state.hover ? this.props.buttonHoverColor : this.props.buttonColor
    };
    return (
      <button style={style} onMouseEnter={this.toggleHover} onMouseLeave={this.toggleHover} onClick={this.showAlert}>
        {this.state.text}
      </button>
    );
  }
}

Button.propTypes = {
  /**
   * @property {propTypes.string} text - Button text.
   */
  text: PropTypes.string.isRequired,
  /**
   * @property {propTypes.string} buttonHoverColor - Button color to be shown on hover.
   */
  buttonHoverColor: PropTypes.string,
  /**
   * @property {propTypes.string} buttonColor- Button default background color.
   */
  buttonColor: PropTypes.string
};

Button.defaultProps = {
  text: 'Example Button',
  buttonColor: 'blue',
  buttonHoverColor: 'green'
};

export default Button;
