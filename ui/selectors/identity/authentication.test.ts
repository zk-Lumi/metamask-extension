import { selectIsSignedIn, selectParticipateInMetaMetrics, } from './authentication';
describe('Authentication Selectors', () => {
    const mockState = {
        AuthenticationController: {
            isSignedIn: true
        },
        metametricsId: 'id',
        MetaMetricsController: {
            participateInMetaMetrics: true
        }
    };
    it('should select the Authentications status', () => {
        expect(selectIsSignedIn(mockState)).toBe(true);
    });
    it('should select the Metamask Notifications Enabled status', () => {
        expect(selectParticipateInMetaMetrics(mockState)).toBe(true);
    });
    it('should select the Metamask Notifications Enabled status', () => {
        expect(selectParticipateInMetaMetrics(mockState)).toBe(true);
    });
});
