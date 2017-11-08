import HeroButton from './HeroButton';

mockDom('<html><body></body></html>');

describe('#HeroButton', () => {
  function mountComponent(props = {}) {
    return mount(<HeroButton text="REACT SF" />);
  }

  it('Should render', () => {
    expect(HeroButton).to.be.ok;
  });
  it('Should contain text REACT SF', () => {
    const wrapper = mountComponent();
    expect(wrapper.text()).to.equal('REACT SF');
  });
});
