/**
 * Movie component that is responsible for playing movie
 *
 * @todo: Remove state mutation, migrate to Redux reducers
 * @todo: Refactor to be more adapter-like
 */

/* eslint react/sort-comp: 0 */

import React, { Component, PropTypes } from 'react';
import { Dropdown, DropdownToggle, DropdownMenu, DropdownItem } from 'reactstrap';
import { Link } from 'react-router';
import Rating from 'react-star-rating-component';
import CardList from '../card/CardList';
import Show from '../show/Show';
import { getIdealTorrent } from '../../api/torrents/BaseTorrentProvider';
import Butter from '../../api/Butter';
import Torrent, { formatSpeeds } from '../../api/Torrent';
import Player from '../../api/Player';
import notie from 'notie';
import os from 'os';


export default class Movie extends Component {

  static propTypes = {
    itemId: PropTypes.string.isRequired,
    activeMode: PropTypes.string.isRequired
  };

  static defaultProps = {
    itemId: '',
    activeMode: 'movies'
  };

  defaultTorrent = {
    default: { quality: undefined, magnet: undefined, seeders: 0 },
    '1080p': { quality: undefined, magnet: undefined, seeders: 0 },
    '720p': { quality: undefined, magnet: undefined, seeders: 0 },
    '480p': { quality: undefined, magnet: undefined, seeders: 0 }
  };

  initialState = {
    item: {
      images: { fanart: '' },
      runtime: {}
    },
    selectedSeason: 1,
    selectedEpisode: 1,
    seasons: [],
    season: [],
    episode: {},
    fetchingTorrents: false,
    idealTorrent: this.defaultTorrent,
    torrent: this.defaultTorrent,
    usingVideoFallback: false,
    similarLoading: false,
    metadataLoading: false,
    torrentInProgress: false,
    torrentProgress: 0
  };

  constructor(props) {
    super(props);

    this.butter = new Butter();
    this.torrent = new Torrent();
    this.player = new Player();

    this.toggle = this.toggle.bind(this);
    this.state = this.initialState;
  }

  /**
   * Check which players are available on the system
   */
  setPlayer(player) {
    this.setState({ currentPlayer: player });
  }

  toggle() {
    this.setState({
      dropdownOpen: !this.state.dropdownOpen
    });
  }

  componentDidMount() {
    this.getAllData(this.props.itemId);

    this.setState({ // eslint-disable-line
      ...this.initialState,
      dropdownOpen: false,
      currentPlayer: 'Default'
    });
  }

  componentWillUnmount() {
    this.stopTorrent();
  }

  componentWillReceiveProps(nextProps) {
    this.getAllData(nextProps.itemId);
  }

  getAllData(itemId) {
    this.setState(this.initialState, () => {
      if (this.props.activeMode === 'shows') {
        this.getShowData(
          'seasons', itemId, this.state.selectedSeason, this.state.selectedEpisode
        );
      }
    });

    this.getItem(itemId).then(item => {
      this.getTorrent(itemId, item.title, 1, 1);
    });

    this.getSimilar(itemId);
  }

  async getShowData(type, imdbId, season, episode) {
    switch (type) {
      case 'seasons':
        this.setState({ seasons: [], episodes: [], episode: {} });
        this.setState({
          seasons: await this.butter.getSeasons(imdbId),
          episodes: await this.butter.getSeason(imdbId, 1),
          episode: await this.butter.getEpisode(imdbId, 1, 1)
        });
        break;
      case 'episodes':
        this.setState({ episodes: [], episode: {} });
        this.setState({
          episodes: await this.butter.getSeason(imdbId, season),
          episode: await this.butter.getEpisode(imdbId, season, 1)
        });
        break;
      case 'episode':
        this.setState({ episode: {} });
        this.setState({
          episode: await this.butter.getEpisode(imdbId, season, episode)
        });
        break;
      default:
        throw new Error('Invalid getShowData() type');
    }
  }

  /**
   * Get the details of a movie using the butter api
   *
   * @todo: remove the temporary loctaion reload once until a way is found to
   *        correctly configure destroy and reconfigure plyr
   *
   * @hack: Possbile solution is to remove the video element on change of movie
   */
  async getItem(imdbId) {
    this.setState({ metadataLoading: true });

    let item;

    switch (this.props.activeMode) {
      case 'movies':
        item = await this.butter.getMovie(imdbId);
        break;
      case 'shows':
        item = await this.butter.getShow(imdbId);
        break;
      default:
        throw new Error('Active mode not found');
    }

    this.setState({ item, metadataLoading: false });

    return item;
  }

  async getTorrent(imdbId, title, season, episode) {
    let torrent;
    let idealTorrent;

    this.setState({
      fetchingTorrents: true,
      idealTorrent: this.defaultTorrent,
      torrent: this.defaultTorrent
    });

    try {
      switch (this.props.activeMode) {
        case 'movies':
          idealTorrent = torrent = await this.butter.getTorrent(imdbId, this.props.activeMode, {
            searchQuery: title
          });
          break;
        case 'shows': {
          if (process.env.FLAG_SEASON_COMPLETE === 'true') {
            const [shows, seasonComplete] = await Promise.all([
              this.butter.getTorrent(imdbId, this.props.activeMode, {
                season,
                episode,
                searchQuery: title
              }),
              this.butter.getTorrent(imdbId, 'season_complete', {
                season,
                searchQuery: title
              })
            ]);

            torrent = {
              '1080p': getIdealTorrent([shows['1080p'], seasonComplete['1080p']]),
              '720p': getIdealTorrent([shows['720p'], seasonComplete['720p']]),
              '480p': getIdealTorrent([shows['480p'], seasonComplete['480p']])
            };

            idealTorrent = getIdealTorrent([
              shows['1080p'] || this.defaultTorrent,
              shows['720p'] || this.defaultTorrent,
              shows['480p'] || this.defaultTorrent,
              seasonComplete['1080p'] || this.defaultTorrent,
              seasonComplete['720p'] || this.defaultTorrent,
              seasonComplete['480p'] || this.defaultTorrent
            ]);
          } else {
            torrent = await this.butter.getTorrent(imdbId, this.props.activeMode, {
              season,
              episode,
              searchQuery: title
            });

            idealTorrent = getIdealTorrent([
              torrent['1080p'] || this.defaultTorrent,
              torrent['720p'] || this.defaultTorrent,
              torrent['480p'] || this.defaultTorrent
            ]);
          }
          break;
        }
        default:
          throw new Error('Invalid active mode');
      }

      if (idealTorrent.quality === 'poor') {
        notie.alert(2, 'Slow torrent, low seeder count', 1);
      }

      this.setState({
        idealTorrent,
        fetchingTorrents: false,
        torrent: {
          '1080p': torrent['1080p'] || this.defaultTorrent,
          '720p': torrent['720p'] || this.defaultTorrent,
          '480p': torrent['480p'] || this.defaultTorrent
        }
      });
    } catch (error) {
      console.log(error);
    }
  }

  async getSimilar(imdbId) {
    this.setState({ similarLoading: true });

    try {
      const similarItems = await this.butter.getSimilar(this.props.activeMode, imdbId);

      this.setState({
        similarItems,
        similarLoading: false,
        isFinished: true
      });
    } catch (error) {
      console.log(error);
    }
  }

  stopTorrent() {
    const torrentEngineName = process.env.FLAG_SEASON_COMPLETE === 'true' &&
                              this.props.activeMode === 'shows'
                                ? 'webtorrent'
                                : 'peerflix';

    this.torrent.destroy(torrentEngineName);
    this.player.destroy();
    clearInterval(this.torrentInfoInterval);
    this.setState({ torrentInProgress: false });
  }

  selectShow(type, selectedSeason, selectedEpisode = 1) {
    switch (type) {
      case 'episodes':
        this.setState({ selectedSeason });
        this.getShowData('episodes', this.state.item.id, selectedSeason);
        this.selectShow('episode', selectedSeason, 1);
        break;
      case 'episode':
        this.setState({ selectedSeason, selectedEpisode });
        this.getShowData('episode', this.state.item.id, selectedSeason, selectedEpisode);
        this.getTorrent(this.state.item.id, this.state.item.title, selectedSeason, selectedEpisode);
        break;
      default:
        throw new Error('Invalid selectShow() type');
    }
  }

  /**
   * @todo: Abstract 'listening' event to Torrent api
   */
  async startTorrent(magnetURI, activeMode) {
    if (this.state.torrentInProgress) {
      this.stopTorrent();
    }

    this.setState({ torrentInProgress: true });

    const metadata = {
      activeMode,
      season: this.state.selectedSeason,
      episode: this.state.selectedEpisode
    };

    const formats = [
      ...Player.experimentalPlaybackFormats, ...Player.nativePlaybackFormats
    ];

    this.torrent.start(magnetURI, metadata, formats, (servingUrl, filename, files, torrent) => {
      console.log('serving at:', servingUrl);

      this.setState({ servingUrl });

      this.torrentInfoInterval = setInterval(() => {
        const { downloadSpeed, uploadSpeed, progress, numPeers, ratio } = formatSpeeds(torrent);
        this.setState({ downloadSpeed, uploadSpeed, progress, numPeers, ratio });
        console.log('----------------------------------------------------');
        console.log('Download Speed:', downloadSpeed);
        console.log('Upload Speed:', uploadSpeed);
        console.log('Progress:', progress);
        console.log('Peers:', numPeers);
        console.log('Ratio:', ratio);
        console.log('----------------------------------------------------');
      }, 1000);

      // HACK: Temporarily prevent linux from using WebChimera
      //       Waiting on issue 69: https://github.com/RSATom/WebChimera.js/issues/69
      //
      // HACK: Refactor to the Adapter architecture for a more elegant solution
      console.warn('Invalid', this.state.currentPlayer);

      switch (this.state.currentPlayer) {
        case 'VLC':
          return this.player.initVLC(servingUrl);
        case 'Default':
          if (Player.isFormatSupported(filename, Player.nativePlaybackFormats)) {
            this.setState({ usingVideoFallback: false });
            this.player = this.player.initPlyr(servingUrl, this.state.item);
          } else if (Player.isFormatSupported(filename, [
            ...Player.nativePlaybackFormats,
            ...Player.experimentalPlaybackFormats
          ])) {
            if (os.type === 'Linux') {
              notie.alert(2, 'Player does not support Linux at the moment', 2);
              return console.warn('WebChimera does not support Linux at the moment');
            }
            console.warn(`Using WebChimera to play ${filename}`);
            notie.alert(2, 'Falling back to non-native video codecs', 2);
            this.setState({ usingVideoFallback: true });
            this.player = this.player.initWebChimeraPlayer(servingUrl, this.state.item);
          } else {
            notie.alert(2, 'The format of this video is not playable', 2);
            console.warn(`Format of filename ${filename} not supported`);
            console.warn('Files retrieved:', files);
          }
          break;
        default:
          console.error('Invalid player');
          break;
      }
    });
  }

  restart() {
    if (this.player) {
      this.player.reset();
    }
  }

  pause() {
    if (this.player) {
      this.player.pause();
    }
  }

  render() {
    const torrentLoadingStatusStyle = { color: 'maroon' };

    return (
      <div className="container">
        <div className="row">
          <div className="col-xs-12">
            <div className="Movie">
              <Link to="/">
                <button
                  className="btn btn-info ion-android-arrow-back"
                  onClick={this.stopTorrent.bind(this)}
                >
                  Back
                </button>
              </Link>
              <span>
                <button
                  onClick={
                    this.startTorrent.bind(
                      this,
                      this.state.idealTorrent.magnet,
                      this.state.idealTorrent.method
                    )
                  }
                  disabled={!this.state.idealTorrent.quality}
                >
                  Start Ideal Torrent
                </button>
              </span>
              {process.env.FLAG_MANUAL_TORRENT_SELECTION === 'true' ?
                <span>
                  <button
                    onClick={
                      this.startTorrent.bind(
                        this,
                        this.state.torrent['1080p'].magnet,
                        this.state.torrent['1080p'].method
                      )
                    }
                    disabled={!this.state.torrent['1080p'].quality}
                  >
                    Start 1080p -- {this.state.torrent['1080p'].seeders} seeders
                  </button>
                  <button
                    onClick={
                      this.startTorrent.bind(
                        this,
                        this.state.torrent['720p'].magnet,
                        this.state.torrent['720p'].method
                      )
                    }
                    disabled={!this.state.torrent['720p'].quality}
                  >
                    Start 720p -- {this.state.torrent['720p'].seeders} seeders
                  </button>
                  {this.props.activeMode === 'shows' ?
                    <button
                      onClick={
                        this.startTorrent.bind(
                          this,
                          this.state.torrent['480p'].magnet,
                          this.state.torrent['480p'].method
                        )
                      }
                      disabled={!this.state.torrent['480p'].quality}
                    >
                      Start 480p -- {this.state.torrent['480p'].seeders} seeders
                    </button>
                    :
                    null}
                </span>
                :
                null}
              <span>
                <a>
                  <strong>
                    Torrent status: {this.state.idealTorrent.health || ''}
                  </strong>
                </a>
              </span>
              <h1 id="title">
                {this.state.item.title}
              </h1>
              <h5>
                Year: {this.state.item.year}
              </h5>
              <h6 id="genres">
                Genres: {this.state.item.genres
                            ? this.state.item.genres.map(genre => `${genre}, `)
                            : null}
              </h6>
              <h5 id="runtime">
                Length: {this.state.item.runtime.full}
              </h5>
              <h6 id="summary">
                {this.state.item.summary}
              </h6>
              {this.state.item.rating ?
                <div>
                  <Rating
                    renderStarIcon={() => <span className="ion-android-star"></span>}
                    starColor={'white'}
                    name={'rating'}
                    value={this.state.item.rating}
                    editing={false}
                  />
                  <a>{this.state.item.rating}</a>
                </div>
                :
                null}
              <h3 style={torrentLoadingStatusStyle}>
                {!this.state.servingUrl && this.state.torrentInProgress
                    ? 'Loading torrent...'
                    : null}
              </h3>
              <h3 style={torrentLoadingStatusStyle}>
                {this.state.fetchingTorrents
                    ? 'Fetching torrents...'
                    : null}
              </h3>

              <div className="row">
                <div className="col-xs-12">
                  <Dropdown isOpen={this.state.dropdownOpen} toggle={this.toggle}>
                    <DropdownToggle caret>
                      {this.state.currentPlayer || 'Default'}
                    </DropdownToggle>
                    <DropdownMenu>
                      <DropdownItem header>Select Player</DropdownItem>
                      <DropdownItem
                        onClick={this.setPlayer.bind(this, 'Default')}
                      >
                        Default
                      </DropdownItem>
                      <DropdownItem
                        onClick={this.setPlayer.bind(this, 'VLC')}
                      >
                        VLC
                      </DropdownItem>
                    </DropdownMenu>
                  </Dropdown>
                </div>
              </div>

              {this.props.activeMode === 'shows' ?
                <Show
                  selectShow={this.selectShow.bind(this)}
                  seasons={this.state.seasons}
                  episodes={this.state.episodes}
                  selectedSeason={this.state.selectedSeason}
                  selectedEpisode={this.state.selectedEpisode}
                />
                :
                null}
              <div
                className="plyr"
                className={this.state.usingVideoFallback ? 'hidden' : ''}
              >
                <video controls poster={this.state.item.images.fanart.full} />
              </div>
            </div>
          </div>
          <div className="col-xs-12">
            <h3 className="text-center">Similar</h3>
            <CardList
              items={this.state.similarItems}
              metadataLoading={this.state.similarLoading}
              isFinished={this.state.isFinished}
            />
          </div>
        </div>
      </div>
    );
  }
}
