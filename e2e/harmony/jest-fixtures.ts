export function specFilePassingFixture(describeText = 'test', itText = 'should pass') {
  return `describe('${describeText}', () => {
  it('${itText}', () => {
    expect(true).toBeTruthy();
  });
});
`;
}

export function specFileFailingFixture() {
  return `describe('test', () => {
  it('should fail', () => {
    expect(false).toBeTruthy();
  });
});
`;
}

export function specFileErroringFixture() {
  return `describe('test', () => {
    throw new Error('SomeError');
  it('should not reach here', () => {
    expect(true).toBeTruthy();
  });
});
`;
}
